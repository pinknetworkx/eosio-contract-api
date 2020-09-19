import * as fs from 'fs';
import { PoolClient } from 'pg';

import { ContractHandler } from '../interfaces';
import { ShipBlock } from '../../../types/ship';
import { EosioActionTrace, EosioTableRow, EosioTransaction } from '../../../types/eosio';
import { ContractDBTransaction } from '../../database';
import logger from '../../../utils/winston';
import { getStackTrace } from '../../../utils';
import { ConfigTableRow } from './types/tables';
import AtomicMarketTableHandler from './tables';
import AtomicMarketActionHandler from './actions';
import StateReceiver from '../../receiver';

export type AtomicMarketArgs = {
    atomicmarket_account: string,
    atomicassets_account: string,
    delphioracle_account: string,

    store_logs: boolean
};

export enum SaleState {
    WAITING = 0,
    LISTED = 1,
    CANCELED = 2,
    SOLD = 3
}

export enum AuctionState {
    WAITING = 0,
    LISTED = 1,
    CANCELED = 2
}

export enum JobPriority {
    TABLE_BALANCES = 90,
    TABLE_MARKETPLACES = 90,
    TABLE_CONFIG = 90,
    ACTION_CREATE_SALE = 80,
    ACTION_CREATE_AUCTION = 80,
    TABLE_AUCTIONS = 70,
    TABLE_SALES = 70,
    ACTION_UPDATE_SALE = 50,
    ACTION_UPDATE_AUCTION = 50
}

export default class AtomicMarketHandler extends ContractHandler {
    static handlerName = 'atomicmarket';

    readonly args: AtomicMarketArgs;

    config: ConfigTableRow;

    notifications: Array<{
        index: number,
        trace: any,
        fn: () => any
    }> = [];
    jobs: Array<{
        priority: number,
        index: number,
        trace: any,
        fn: () => any
    }> = [];

    tableHandler: AtomicMarketTableHandler;
    actionHandler: AtomicMarketActionHandler;

    materializedViewRefresh = true;

    constructor(reader: StateReceiver, args: {[key: string]: any}, minBlock: number = 0) {
        super(reader, args, minBlock);

        if (typeof args.atomicmarket_account !== 'string') {
            throw new Error('AtomicMarket: Argument missing in atomicmarket handler: atomicmarket_account');
        }

        this.scope = {
            actions: [
                {
                    filter: this.args.atomicmarket_account + ':*',
                    deserialize: true
                }
            ],
            tables: [
                {
                    filter: this.args.atomicmarket_account + ':*',
                    deserialize: true
                }
            ]
        };

        this.tableHandler = new AtomicMarketTableHandler(this);
        this.actionHandler = new AtomicMarketActionHandler(this);
    }

    async init(client: PoolClient): Promise<void> {
        const existsQuery = await client.query(
            'SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2)',
            [await this.connection.database.schema(), 'atomicmarket_config']
        );

        const materializedViews = ['atomicmarket_sale_prices', 'atomicmarket_auction_mints', 'atomicmarket_sale_mints', 'atomicmarket_template_prices'];

        if (!existsQuery.rows[0].exists) {
            logger.info('Could not find AtomicMarket tables. Create them now...');

            await client.query(fs.readFileSync('./definitions/tables/atomicmarket_tables.sql', {
                encoding: 'utf8'
            }));

            const views = [
                'atomicmarket_assets_master', 'atomicmarket_auctions_master',
                'atomicmarket_sales_master', 'atomicmarket_sale_prices_master',
                'atomicmarket_template_prices_master'
            ];

            for (const view of views) {
                await client.query(fs.readFileSync('./definitions/views/' + view + '.sql', {encoding: 'utf8'}));
            }

            for (const view of materializedViews) {
                await client.query(fs.readFileSync('./definitions/materialized/' + view + '.sql', {encoding: 'utf8'}));
            }

            logger.info('AtomicMarket tables successfully created');
        }

        const configQuery = await client.query(
            'SELECT * FROM atomicmarket_config WHERE market_contract = $1',
            [this.args.atomicmarket_account]
        );

        if (configQuery.rows.length === 0) {
            const configTable = await this.connection.chain.rpc.get_table_rows({
                json: true, code: this.args.atomicmarket_account,
                scope: this.args.atomicmarket_account, table: 'config'
            });

            if (configTable.rows.length === 0) {
                throw new Error('AtomicMarket: Unable to fetch atomicmarket version');
            }

            const config: ConfigTableRow = configTable.rows[0];

            this.args.delphioracle_account = config.delphioracle_account;
            this.args.atomicassets_account = config.atomicassets_account;

            await client.query(
                'INSERT INTO atomicmarket_config ' +
                '(' +
                    'market_contract, assets_contract, delphi_contract, ' +
                    'version, maker_market_fee, taker_market_fee, ' +
                    'minimum_auction_duration, maximum_auction_duration, ' +
                    'minimum_bid_increase, auction_reset_duration' +
                ') ' +
                'VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
                [
                    this.args.atomicmarket_account,
                    this.args.atomicassets_account,
                    config.delphioracle_account,
                    config.version,
                    config.maker_market_fee,
                    config.taker_market_fee,
                    config.minimum_auction_duration,
                    config.maximum_auction_duration,
                    config.minimum_bid_increase,
                    config.auction_reset_duration
                ]
            );

            this.config = {
                ...config,
                supported_symbol_pairs: [],
                supported_tokens: []
            };
        } else {
            this.args.delphioracle_account = configQuery.rows[0].delphi_contract;
            this.args.atomicassets_account = configQuery.rows[0].assets_contract;

            const tokensQuery = await this.connection.database.query(
                'SELECT * FROM atomicmarket_tokens WHERE market_contract = $1',
                [this.args.atomicmarket_account]
            );

            const pairsQuery = await this.connection.database.query(
                'SELECT * FROM atomicmarket_symbol_pairs WHERE market_contract = $1',
                [this.args.atomicmarket_account]
            );

            this.config = {
                ...configQuery.rows[0],
                supported_symbol_pairs: pairsQuery.rows.map(row => ({
                    listing_symbol: 'X,' + row.listing_symbol,
                    settlement_symbol: 'X,' + row.settlement_symbol,
                    invert_delphi_pair: row.invert_delphi_pair,
                    delphi_pair_name: row.delphi_pair_name
                })),
                supported_tokens: tokensQuery.rows.map(row => ({
                    token_contract: row.token_contract,
                    token_symbol: row.token_precision + ',' + row.token_symbol
                })),
                auction_counter: 0,
                sale_counter: 0,
                delphioracle_account: this.args.delphioracle_account,
                atomicassets_account: this.args.atomicassets_account
            };
        }

        setTimeout(async () => {
            while (this.materializedViewRefresh) {
                try {
                    for (const view of materializedViews) {
                        const key = 'eosio-contract-api:' + this.connection.chain.name + ':' + this.connection.database.name + ':' + view;

                        const updated = JSON.parse(await this.connection.redis.ioRedis.get(key)) || 0;

                        // only update every 50 seconds if multiple processes are running
                        if (updated < Date.now() - 50000) {
                            await this.connection.database.query('REFRESH MATERIALIZED VIEW CONCURRENTLY ' + view);

                            await this.connection.redis.ioRedis.set(key, JSON.stringify(Date.now()));
                        }
                    }
                } catch (e) {
                    logger.error(e);
                }

                await new Promise((resolve => setTimeout(resolve, 60000)));
            }
        }, 5000);
    }

    async deleteDB(client: PoolClient): Promise<void> {
        const tables = [
            'atomicmarket_auctions', 'atomicmarket_auctions_bids', 'atomicmarket_config',
            'atomicmarket_delphi_pairs', 'atomicmarket_marketplaces', 'atomicmarket_sales',
            'atomicmarket_token_symbols'
        ];

        for (const table of tables) {
            await client.query(
                'DELETE FROM ' + client.escapeIdentifier(table) + ' WHERE market_contract = $1',
                [this.args.atomicmarket_account]
            );
        }

        const views = ['atomicmarket_sale_prices', 'atomicmarket_sale_mints'];

        for (const view of views) {
            await client.query('REFRESH MATERIALIZED VIEW ' + client.escapeIdentifier(view) + '');
        }
    }

    async onAction(db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace, tx: EosioTransaction): Promise<void> {
        await this.actionHandler.handleTrace(db, block, trace, tx);
    }

    async onTableChange(db: ContractDBTransaction, block: ShipBlock, delta: EosioTableRow): Promise<void> {
        await this.tableHandler.handleUpdate(db, block, delta);
    }

    async onBlockStart(): Promise<void> {
        this.jobs = [];
        this.notifications = [];
    }

    async onBlockComplete(): Promise<void> {
        this.jobs.sort((a, b) => {
            if (a.priority === b.priority) {
                return a.index - b.index;
            }

            return b.priority - a.priority;
        });

        for (const job of this.jobs) {
            try {
                await job.fn();
            } catch (e) {
                logger.error('Error while processing update job', job.trace);

                throw e;
            }
        }

        this.jobs = [];
    }

    async onCommit(): Promise<void> {
        for (const notification of this.notifications) {
            try {
                await notification.fn();
            } catch (e) {
                logger.warn('Error while pushing notification', e);
            }
        }

        this.notifications = [];
    }

    addUpdateJob(fn: () => any, priority: JobPriority): void {
        this.jobs.push({
            priority: priority.valueOf(),
            index: this.jobs.length,
            trace: getStackTrace(),
            fn: fn
        });
    }

    pushNotificiation(block: ShipBlock, tx: EosioTransaction | null, prefix: string, name: string, data: any): void {
        if (block.block_num < block.last_irreversible.block_num) {
            return;
        }

        this.notifications.push({
            index: this.notifications.length,
            trace: getStackTrace(),
            fn: async () => {
                const channelName = [
                    'eosio-contract-api', this.connection.chain.name, this.reader.name,
                    'atomicmarket', this.args.atomicmarket_account, prefix
                ].join(':');

                await this.connection.redis.ioRedis.publish(channelName, JSON.stringify({
                    transaction: tx,
                    block: {block_num: block.block_num, block_id: block.block_id},
                    action: name, data
                }));
            }
        });
    }
}
