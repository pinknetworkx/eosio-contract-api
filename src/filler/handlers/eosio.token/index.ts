import * as fs from 'fs';
import { PoolClient } from 'pg';

import { ContractHandler } from '../interfaces';
import { ShipBlock } from '../../../types/ship';
import { EosioActionTrace, EosioTableRow, EosioTransaction } from '../../../types/eosio';
import { ContractDBTransaction } from '../../database';
import ConnectionManager from '../../../connections/manager';
import { PromiseEventHandler } from '../../../utils/event';
import logger from '../../../utils/winston';

export type AtomicMarketArgs = {
    token_account: string,
    store_transfers: boolean,
    store_balances: boolean
};

export default class AtomicMarketHandler extends ContractHandler {
    static handlerName = 'atomicmarket';

    readonly args: AtomicMarketArgs;

    constructor(connection: ConnectionManager, events: PromiseEventHandler, args: {[key: string]: any}) {
        super(connection, events, args);

        if (typeof args.token_account !== 'string') {
            throw new Error('eosio.token: Argument missing in eosio.token handler: token_account');
        }

        this.scope = {
            actions: [
                {
                    filter: this.args.token_account + ':transfer',
                    deserialize: true
                }
            ],
            tables: [
                {
                    filter: this.args.token_account + ':stat',
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
    }

    async deleteDB(client: PoolClient): Promise<void> {
        const tables = [
            'token_transfers', 'token_balances', 'token_stats'
        ];

        for (const table of tables) {
            await client.query(
                'DELETE FROM ' + client.escapeIdentifier(table) + ' WHERE market_contract = $1',
                [this.args.token_account]
            );
        }
    }

    async onAction(db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace, tx: EosioTransaction): Promise<void> {

    }

    async onTableChange(db: ContractDBTransaction, block: ShipBlock, delta: EosioTableRow): Promise<void> {

    }

    async onBlockComplete(db: ContractDBTransaction): Promise<void> { }
    async onCommit(): Promise<void> { }
}
