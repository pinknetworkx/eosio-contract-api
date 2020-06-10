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

export type AtomicMarketArgs = {
    atomicassets_account: string,
    atomicmarket_account: string
};

export enum SaleState {
    LISTED = 0,
    CANCELED = 1,
    SOLD = 2
}

export enum AuctionState {
    PENDING = 0,
    FINISHED = 1
}

export default class AtomicAssetsHandler extends ContractHandler {
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

        // TODO fill config
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

    async onAction(_db: ContractDBTransaction, _block: ShipBlock, _trace: EosioActionTrace, _tx: EosioTransaction): Promise<void> {

    }

    async onTableChange(_db: ContractDBTransaction, _block: ShipBlock, _delta: EosioTableRow): Promise<void> {

    }

    async onBlockComplete(db: ContractDBTransaction, block: ShipBlock): Promise<void> {
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

    addUpdateJob(fn: () => any, priority: number): void {
        const trace = getStackTrace();

        this.updateJobs.push(this.updateQueue.add(async () => {
            try {
                await fn();
            } catch (e) {
                logger.error(trace);
                throw e;
            }
        }, {priority}));
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
