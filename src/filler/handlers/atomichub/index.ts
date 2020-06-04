import * as fs from 'fs';
import { PoolClient } from 'pg';

import { ContractHandler } from '../interfaces';
import { ShipBlock } from '../../../types/ship';
import { EosioActionTrace, EosioTransaction } from '../../../types/eosio';
import { ContractDBTransaction } from '../../database';
import ConnectionManager from '../../../connections/manager';
import { PromiseEventHandler } from '../../../utils/event';
import logger from '../../../utils/winston';
import AtomicAssetsActionHandler from './atomicassets';
import AtomicMarketActionHandler from './atomicmarket';
import { eosioTimestampToDate } from '../../../utils/eosio';

export type AtomicMarketArgs = {
    atomicassets_account: string,
    atomicmarket_account: string
};

export default class AtomicHubHandler extends ContractHandler {
    static handlerName = 'atomicmarket';

    readonly args: AtomicMarketArgs;

    readonly atomicassetsHandler: AtomicAssetsActionHandler;
    readonly atomicmarketHandler: AtomicMarketActionHandler;

    constructor(connection: ConnectionManager, events: PromiseEventHandler, args: {[key: string]: any}) {
        if (typeof args.atomicassets_account !== 'string') {
            throw new Error('Argument missing in atomichub reader handler: atomicassets_account');
        }

        if (typeof args.atomicmarket_account !== 'string') {
            throw new Error('Argument missing in atomichub reader handler: atomicmarket_account');
        }

        super(connection, events, args);

        this.scope = {
            actions: [
                {
                    filter: this.args.atomicassets_account + ':*',
                    deserialize: true
                },
                {
                    filter: this.args.atomicmarket_account + ':*',
                    deserialize: true
                }
            ],
            tables: [ ]
        };

        this.atomicassetsHandler = new AtomicAssetsActionHandler(this);
        this.atomicmarketHandler = new AtomicMarketActionHandler(this);
    }

    async init(): Promise<void> {
        try {
            await this.connection.database.query('SELECT * FROM atomichub_watchlist LIMIT 1');
        } catch (e) {
            logger.info('Could not find AtomicHub tables. Create them now...');

            await this.connection.database.query(fs.readFileSync('./definitions/tables/atomichub_tables.sql', {
                encoding: 'utf8'
            }));

            logger.info('AtomicHub tables successfully created');
        }
    }

    async deleteDB(client: PoolClient): Promise<void> {
        await client.query('DELETE FROM atomichub_watchlist WHERE contract = $1', [this.args.atomicassets_account]);
        await client.query('DELETE FROM atomichub_notifications');
    }

    async onAction(db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace, tx: EosioTransaction): Promise<void> {
        if (trace.act.account === this.args.atomicmarket_account) {
            await this.atomicmarketHandler.handleTrace(db, block, trace, tx);
        } else if (trace.act.account === this.args.atomicassets_account) {
            await this.atomicassetsHandler.handleTrace(db, block, trace, tx);
        }
    }

    async onTableChange(): Promise<void> { }

    async onBlockComplete(): Promise<void> {
        this.atomicmarketHandler.cleanup();
        this.atomicassetsHandler.cleanup();
    }

    async onCommit(): Promise<void> { }

    async createNotification(
        db: ContractDBTransaction, block: ShipBlock, contract: string, account: string, message: string, reference: any
    ): Promise<void> {
        await db.insert('atomichub_notifications', {
            account, message, reference: JSON.stringify(reference),
            block_num: block.block_num, block_time: eosioTimestampToDate(block.timestamp)
        }, ['id']);

        const channelName = ['eosio-contract-api', this.connection.chain.name, 'atomichub', contract, 'notifications'].join(':');

        await this.connection.redis.ioRedis.publish(channelName, JSON.stringify({
            account: account,
            notification: {
                message: message, reference: reference,
                block_num: block.block_num, block_time: eosioTimestampToDate(block.timestamp)
            }
        }));
    }
}
