import * as fs from 'fs';
import { PoolClient } from 'pg';

import { ContractHandler } from '../interfaces';
import logger from '../../../utils/winston';
import { ConfigTableRow } from './types/tables';
import Filler  from '../../filler';
import { DELPHIORACLE_BASE_PRIORITY } from '../delphioracle';
import { ATOMICASSETS_BASE_PRIORITY } from '../atomicassets';
import DataProcessor from '../../processor';
import ApiNotificationSender from '../../notifier';
import { auctionProcessor } from './processors/auctions';
import { balanceProcessor } from './processors/balances';
import { configProcessor } from './processors/config';
import { logProcessor } from './processors/logs';
import { JobQueuePriority } from '../../jobqueue';

export const NEFTYMARKET_BASE_PRIORITY = Math.max(ATOMICASSETS_BASE_PRIORITY, DELPHIORACLE_BASE_PRIORITY) + 1000;

export type NeftyMarketArgs = {
    neftymarket_account: string,
    atomicassets_account: string,
    store_logs: boolean
};

export enum AuctionState {
    LISTED = 1,
    CANCELED = 2,
    SOLD = 3
}

export enum NeftyMarketUpdatePriority {
    TABLE_BALANCES = NEFTYMARKET_BASE_PRIORITY + 10,
    TABLE_MARKETPLACES = NEFTYMARKET_BASE_PRIORITY + 10,
    TABLE_CONFIG = NEFTYMARKET_BASE_PRIORITY + 10,
    ACTION_CREATE_AUCTION = NEFTYMARKET_BASE_PRIORITY + 20,
    TABLE_AUCTIONS = NEFTYMARKET_BASE_PRIORITY + 30,
    ACTION_UPDATE_AUCTION = NEFTYMARKET_BASE_PRIORITY + 50,
    LOGS = NEFTYMARKET_BASE_PRIORITY
}

export default class NeftyMarketHandler extends ContractHandler {
    static handlerName = 'neftymarket';

    declare readonly args: NeftyMarketArgs;

    config: ConfigTableRow;

    static async setup(client: PoolClient): Promise<boolean> {
        const existsQuery = await client.query(
            'SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2)',
            ['public', 'neftymarket_config']
        );

        const views = [
            'neftymarket_auctions_master',
        ];

        const materializedViews = ['neftymarket_auction_prices'];

        const procedures = ['neftymarket_auction_mints'];

        if (!existsQuery.rows[0].exists) {
            logger.info('Could not find NeftyMarket tables. Create them now...');

            await client.query(fs.readFileSync('./definitions/tables/neftymarket_tables.sql', {
                encoding: 'utf8'
            }));

            for (const view of materializedViews) {
                await client.query(fs.readFileSync('./definitions/materialized/' + view + '.sql', {encoding: 'utf8'}));
            }

            for (const view of views) {
                await client.query(fs.readFileSync('./definitions/views/' + view + '.sql', {encoding: 'utf8'}));
            }

            for (const procedure of procedures) {
                await client.query(fs.readFileSync('./definitions/procedures/' + procedure + '.sql', {encoding: 'utf8'}));
            }

            logger.info('NeftyMarket tables successfully created');

            return true;
        }

        return false;
    }

    static async upgrade(client: PoolClient, version: string): Promise<void> {

    }

    constructor(filler: Filler, args: {[key: string]: any}) {
        super(filler, args);

        if (typeof args.neftymarket_account !== 'string') {
            throw new Error('NeftyMarket: Argument missing in neftymarket handler: neftymarket_account');
        }
    }

    async init(client: PoolClient): Promise<void> {
        const configQuery = await client.query(
            'SELECT * FROM neftymarket_config WHERE market_contract = $1',
            [this.args.neftymarket_account]
        );

        if (configQuery.rows.length === 0) {
            const configTable = await this.connection.chain.rpc.get_table_rows({
                json: true, code: this.args.neftymarket_account,
                scope: this.args.neftymarket_account, table: 'config'
            });

            if (configTable.rows.length === 0) {
                throw new Error('NeftyMarket: Unable to fetch neftymarket config');
            }

            const config: ConfigTableRow = configTable.rows[0];
            await client.query(
                'INSERT INTO neftymarket_config ' +
                '(' +
                    'market_contract, assets_contract, ' +
                    'market_fee, min_bid_increase, last_bid_threshold, ' +
                    'fee_recipient ' +
                ') ' +
                'VALUES ($1, $2, $3, $4, $5, $6)',
                [
                    this.args.neftymarket_account,
                    this.args.atomicassets_account,
                    config.market_fee,
                    config.min_bid_increase,
                    config.last_bid_threshold,
                    config.fee_recipient,
                ]
            );

            this.config = {
                ...config,
                supported_tokens: []
            };
        } else {
            const tokensQuery = await this.connection.database.query(
                'SELECT * FROM neftymarket_tokens WHERE market_contract = $1',
                [this.args.neftymarket_account]
            );

            this.config = {
                ...configQuery.rows[0],
                supported_tokens: tokensQuery.rows.map(row => ({
                    contract: row.token_contract,
                    sym: row.token_precision + ',' + row.token_symbol
                })),
                atomicassets_account: this.args.atomicassets_account
            };
        }
    }

    async deleteDB(client: PoolClient): Promise<void> {
        const tables = [
            'neftymarket_auctions', 'neftymarket_auctions_assets', 'neftymarket_auctions_bids',
            'neftymarket_config', 'neftymarket_token_symbols', 'neftymarket_balances'
        ];

        for (const table of tables) {
            await client.query(
                'DELETE FROM ' + client.escapeIdentifier(table) + ' WHERE market_contract = $1',
                [this.args.neftymarket_account]
            );
        }

        const materializedViews = ['neftymarket_auction_prices'];

        for (const view of materializedViews) {
            await client.query('REFRESH MATERIALIZED VIEW ' + client.escapeIdentifier(view) + '');
        }
    }

    async register(processor: DataProcessor, notifier: ApiNotificationSender): Promise<() => any> {
        const destructors: Array<() => any> = [];

        destructors.push(auctionProcessor(this, processor, notifier));
        destructors.push(balanceProcessor(this, processor));
        destructors.push(configProcessor(this, processor));

        if (this.args.store_logs) {
            destructors.push(logProcessor(this, processor));
        }

        const materializedViews: Array<{name: string, priority: JobQueuePriority}> = [
            {name: 'neftymarket_auction_prices', priority: JobQueuePriority.LOW},
        ];

        for (const view of materializedViews) {
            let lastVacuum = Date.now();

            this.filler.jobs.add(`Refresh MV ${view.name}`, 60_000, view.priority, async () => {
                await this.connection.database.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${view.name}`);

                if (lastVacuum + 3600 * 24 * 1000 < Date.now()) {
                    await this.connection.database.query(`VACUUM ANALYZE ${view.name}`);

                    logger.info(`Successfully ran vacuum on ${view.name}`);

                    lastVacuum = Date.now();
                }
            });
        }

        this.filler.jobs.add('update_neftymarket_auction_mints', 30_000, JobQueuePriority.MEDIUM, async () => {
            await this.connection.database.query(
                'CALL update_neftymarket_auction_mints($1, $2)',
                [this.args.neftymarket_account, this.filler.reader.lastIrreversibleBlock]
            );
        });

        return (): any => destructors.map(fn => fn());
    }
}
