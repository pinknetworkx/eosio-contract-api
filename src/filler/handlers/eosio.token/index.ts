import * as fs from 'fs';
import { PoolClient } from 'pg';

import { ContractHandler } from '../interfaces';
import { ShipBlock } from '../../../types/ship';
import { EosioActionTrace, EosioTableRow, EosioTransaction } from '../../../types/eosio';
import { ContractDBTransaction } from '../../database';
import logger from '../../../utils/winston';
import StateReceiver from '../../receiver';

export type EosioTokenArgs = {
    token_account: string,
    store_transfers: boolean,
    store_balances: boolean,
    store_supply_deltas: boolean
};

export default class EosioTokenHandler extends ContractHandler {
    static handlerName = 'eosio.token';

    readonly args: EosioTokenArgs;

    constructor(reader: StateReceiver, args: {[key: string]: any}, minBlock: number = 0) {
        super(reader, args, minBlock);

        if (typeof args.token_account !== 'string') {
            throw new Error('eosio.token: Argument missing in eosio.token handler: token_account');
        }

        if (!this.args.store_transfers) {
            logger.warn('eosio.token: disabled store_transfers');
        }

        if (!this.args.store_balances) {
            logger.warn('eosio.token: disabled store_balances');
        }

        if (!this.args.store_supply_deltas) {
            logger.warn('eosio.token: disabled store_supply_deltas');
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
                    filter: this.args.token_account + ':*',
                    deserialize: true
                }
            ]
        };
    }

    async init(client: PoolClient): Promise<void> {
        const existsQuery = await client.query(
            'SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2)',
            [await this.connection.database.schema(), 'token_stats']
        );

        if (!existsQuery.rows[0].exists) {
            logger.info('Could not find eosio.token tables. Create them now...');

            await client.query(fs.readFileSync('./definitions/tables/token_tables.sql', {
                encoding: 'utf8'
            }));

            logger.info('eosio.token tables successfully created');
        }
    }

    async deleteDB(client: PoolClient): Promise<void> {
        const tables = [
            'token_stats', 'token_supply_deltas', 'token_transfers', 'token_balances'
        ];

        for (const table of tables) {
            await client.query(
                'DELETE FROM ' + client.escapeIdentifier(table) + ' WHERE contract = $1',
                [this.args.token_account]
            );
        }
    }

    async onAction(_db: ContractDBTransaction, _block: ShipBlock, _trace: EosioActionTrace, _tx: EosioTransaction): Promise<void> {

    }

    async onTableChange(_db: ContractDBTransaction, _block: ShipBlock, _delta: EosioTableRow): Promise<void> {

    }

    async onBlockStart(): Promise<void> { }
    async onBlockComplete(): Promise<void> { }
    async onCommit(): Promise<void> { }
}
