import * as fs from 'fs';
import { PoolClient } from 'pg';
import PQueue from 'p-queue';

import { ContractHandler } from '../interfaces';
import { ShipBlock } from '../../../types/ship';
import { EosioActionTrace, EosioTableRow, EosioTransaction } from '../../../types/eosio';
import { ContractDBTransaction } from '../../database';
import ConnectionManager from '../../../connections/manager';
import { PromiseEventHandler } from '../../../utils/event';
import logger from '../../../utils/winston';
import { getStackTrace } from '../../../utils';
import { ConfigTableRow } from './types/tables';
import AtomicMarketTableHandler from './tables';
import AtomicMarketActionHandler from './actions';

export type AtomicMarketArgs = {
    atomicassets_account: string,
    atomicmarket_account: string
};

export enum SaleState {
    LISTED = 0,
    CANCELED = 1,
    SOLD = 2,
    WAITING = 3
}

export enum AuctionState {
    LISTED = 0,
    CANCELED = 1,
    FINISHED = 2,
    WAITING = 3
}

export enum JobPriority {
    INDEPENDENT = 100,
    TABLE_BALANCES = 90,
    TABLE_CONFIG = 90,
    TABLE_AUCTIONS = 80,
    TABLE_SALES = 80,
    ACTION_UPDATE_SALE = 50,
    ACTION_UPDATE_AUCTION = 50
}

export default class AtomicMarketHandler extends ContractHandler {
    static handlerName = 'atomicmarket';

    readonly args: AtomicMarketArgs;

    config: {
        version: string
    };

    reversible = false;

    updateQueue: PQueue;
    updateJobs: any[] = [];

    notificationQueue: PQueue;
    notificationJobs: any[] = [];

    tableHandler: AtomicMarketTableHandler;
    actionHandler: AtomicMarketActionHandler;

    constructor(connection: ConnectionManager, events: PromiseEventHandler, args: {[key: string]: any}) {
        super(connection, events, args);

        if (typeof args.atomicassets_account !== 'string') {
            throw new Error('Argument missing in atomicmarket handler: atomicassets_account');
        }

        if (typeof args.atomicmarket_account !== 'string') {
            throw new Error('Argument missing in atomicmarket handler: atomicmarket_account');
        }

        this.updateQueue = new PQueue({concurrency: 1, autoStart: false});
        this.updateQueue.pause();

        this.notificationQueue = new PQueue({concurrency: 1, autoStart: false});
        this.notificationQueue.pause();

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

        if (!existsQuery.rows[0].exists) {
            logger.info('Could not find AtomicMarket tables. Create them now...');

            await client.query(fs.readFileSync('./definitions/tables/atomicmarket_tables.sql', {
                encoding: 'utf8'
            }));

            logger.info('AtomicMarket tables successfully created');
        }

        const views = ['atomicmarket_assets_master', 'atomicmarket_auctions_master', 'atomicmarket_sales_master'];

        for (const view of views) {
            await client.query(fs.readFileSync('./definitions/views/' + view + '.sql', {encoding: 'utf8'}));
        }

        const configQuery = await client.query(
            'SELECT * FROM atomicmarket_config WHERE market_contract = $1',
            [this.args.atomicassets_account]
        );

        if (configQuery === null || configQuery.rows.length === 0) {
            const configTable = await this.connection.chain.rpc.get_table_rows({
                json: true, code: this.args.atomicmarket_account,
                scope: this.args.atomicmarket_account, table: 'config'
            });

            if (configTable.rows.length === 0) {
                throw new Error('Unable to fetch atomicmarket version');
            }

            const config: ConfigTableRow = configTable.rows[0];

            if (config.atomicassets_account !== this.args.atomicassets_account) {
                throw new Error('AtomicAssets does not match the config in atomicmarket reader');
            }

            await client.query(
                'INSERT INTO atomicmarket_config ' +
                '(market_contract, asset_contract, delphi_contract, version, market_market_fee, taker_market_fee, maximum_auction_duration, minimum_bid_increase) ' +
                'VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
                [
                    this.args.atomicmarket_account,
                    this.args.atomicassets_account,
                    config.delphioracle_account,
                    config.version,
                    config.maker_market_fee,
                    config.taker_market_fee,
                    config.maximum_auction_duration,
                    config.minimum_bid_increase
                ]
            );

            this.config.version = config.version;

        } else {
            this.config.version = configQuery.rows[0].version;
        }
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
    }

    async onAction(db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace, tx: EosioTransaction): Promise<void> {
        await this.actionHandler.handleTrace(db, block, trace, tx);
    }

    async onTableChange(db: ContractDBTransaction, block: ShipBlock, delta: EosioTableRow): Promise<void> {
        await this.tableHandler.handleUpdate(db, block, delta);
    }

    async onBlockComplete(db: ContractDBTransaction): Promise<void> {
        this.reversible = db.currentBlock > db.lastIrreversibleBlock;

        this.updateQueue.start();
        await Promise.all(this.updateJobs);
        this.updateQueue.pause();
        this.updateJobs = [];
    }

    async onCommit(): Promise<void> {
        this.notificationQueue.start();
        await Promise.all(this.notificationJobs);
        this.notificationQueue.pause();
        this.notificationJobs = [];
    }

    addUpdateJob(fn: () => any, priority: JobPriority): void {
        const trace = getStackTrace();

        this.updateJobs.push(this.updateQueue.add(async () => {
            try {
                await fn();
            } catch (e) {
                logger.error(trace);

                throw e;
            }
        }, {priority: priority.valueOf()}));
    }

    pushNotificiation(block: ShipBlock, tx: EosioTransaction | null, prefix: string, name: string, data: any): void {
        if (!this.reversible) {
            return;
        }

        const trace = getStackTrace();

        this.notificationJobs.push(this.notificationQueue.add(async () => {
            try {
                const channelName = [
                    'eosio-contract-api', this.connection.chain.name, 'atomicmarket',
                    this.args.atomicassets_account, prefix
                ].join(':');

                await this.connection.redis.ioRedis.publish(channelName, JSON.stringify({
                    transaction: tx,
                    block: {block_num: block.block_num, block_id: block.block_id},
                    action: name, data
                }));
            } catch (e) {
                logger.warn('Error while pushing notification', trace);
            }
        }));
    }
}
