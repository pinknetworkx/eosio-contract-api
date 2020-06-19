import * as fs from 'fs';
import { PoolClient } from 'pg';

import { ContractHandler } from '../interfaces';
import { ShipBlock } from '../../../types/ship';
import { EosioActionTrace, EosioTransaction } from '../../../types/eosio';
import { ContractDBTransaction } from '../../database';
import logger from '../../../utils/winston';
import AtomicAssetsActionHandler from './atomicassets';
import AtomicMarketActionHandler from './atomicmarket';
import { eosioTimestampToDate } from '../../../utils/eosio';
import StateReceiver from '../../receiver';

export type AtomicMarketArgs = {
    atomicassets_account: string,
    atomicmarket_account: string
};

export default class AtomicHubHandler extends ContractHandler {
    static handlerName = 'atomichub';

    readonly args: AtomicMarketArgs;

    readonly atomicassetsHandler: AtomicAssetsActionHandler;
    readonly atomicmarketHandler: AtomicMarketActionHandler;

    constructor(reader: StateReceiver, args: {[key: string]: any}, minBlock: number = 0) {
        super(reader, args, minBlock);

        if (typeof args.atomicassets_account !== 'string') {
            throw new Error('AtomicHub: Argument missing in atomichub reader handler: atomicassets_account');
        }

        if (typeof args.atomicmarket_account !== 'string') {
            throw new Error('AtomicHub: Argument missing in atomichub reader handler: atomicmarket_account');
        }

        this.scope = {
            actions: [
                {
                    filter: this.args.atomicassets_account + ':*',
                    deserialize: true
                }
            ],
            tables: [ ]
        };

        this.atomicassetsHandler = new AtomicAssetsActionHandler(this);
        this.atomicmarketHandler = new AtomicMarketActionHandler(this);
    }

    async init(client: PoolClient): Promise<void> {
        const existsQuery = await client.query(
            'SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2)',
            [await this.connection.database.schema(), 'atomichub_notifications']
        );

        if (!existsQuery.rows[0].exists) {
            logger.info('Could not find AtomicHub tables. Create them now...');

            await client.query(fs.readFileSync('./definitions/tables/atomichub_tables.sql', {
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
        if (trace.act.account === this.args.atomicassets_account) {
            await this.atomicassetsHandler.handleTrace(db, block, trace, tx);
        }
    }

    async onTableChange(): Promise<void> { }
    async onBlockStart(): Promise<void> { }
    async onBlockComplete(): Promise<void> { }

    async onCommit(block: ShipBlock): Promise<void> {
        if (block.block_num % (7200 * 6) === 0) {
            // only keep last 100 notifications of account to prevent spam
            await this.connection.database.query(
                'DELETE FROM atomichub_notifications n1 WHERE n1.id NOT IN (' +
                    'SELECT n2.id FROM atomichub_notifications n2 WHERE n2.account = n1.account ORDER BY block_num DESC LIMIT 100' +
                ')'
            );
        }
    }

    async createNotification(
        db: ContractDBTransaction, block: ShipBlock, contract: string, account: string, message: string, reference: any
    ): Promise<void> {
        await db.insert('atomichub_notifications', {
            account, contract, message, reference: JSON.stringify(reference),
            block_num: block.block_num, block_time: eosioTimestampToDate(block.timestamp).getTime()
        }, ['id']);

        const channelName = [
            'eosio-contract-api', this.connection.chain.name, this.reader.name,
            'atomichub', contract, 'notifications'
        ].join(':');

        await this.connection.redis.ioRedis.publish(channelName, JSON.stringify({
            account: account,
            notification: {
                message: message, reference: reference,
                block_num: block.block_num, block_time: eosioTimestampToDate(block.timestamp).getTime()
            }
        }));
    }
}
