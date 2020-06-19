import * as fs from 'fs';
import { PoolClient } from 'pg';

import { ContractHandler } from '../interfaces';
import { ShipBlock } from '../../../types/ship';
import { EosioActionTrace, EosioTableRow, EosioTransaction } from '../../../types/eosio';
import { ContractDBTransaction } from '../../database';
import logger from '../../../utils/winston';
import StateReceiver from '../../receiver';

export type WaxArgs = {
    store_vote_weight: boolean,
    store_gbm_balances: boolean,
    store_gbm_deltas: boolean
};

export default class WaxHandler extends ContractHandler {
    static handlerName = 'eosio.wax';

    readonly args: WaxArgs;

    constructor(reader: StateReceiver, args: {[key: string]: any}, minBlock: number = 0) {
        super(reader, args, minBlock);

        if (!this.args.store_vote_weight) {
            logger.warn('eosio.wax: disabled store_vote_weight');
        }

        if (!this.args.store_gbm_balances) {
            logger.warn('eosio.wax: disabled store_gbm_balances');
        }

        if (!this.args.store_gbm_deltas) {
            logger.warn('eosio.wax: disabled store_gbm_deltas');
        }

        this.scope = {
            actions: [ ],
            tables: [
                {
                    filter: 'eosio:genesis',
                    deserialize: true
                },
                {
                    filter: 'eosio:voters',
                    deserialize: true
                }
            ]
        };
    }

    async init(client: PoolClient): Promise<void> {
        const existsQuery = await client.query(
            'SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2)',
            [await this.connection.database.schema(), 'wax_gbm_balances']
        );

        if (!existsQuery.rows[0].exists) {
            logger.info('Could not find WAX tables. Create them now...');

            await client.query(fs.readFileSync('./definitions/tables/wax_tables.sql', {
                encoding: 'utf8'
            }));

            logger.info('WAX tables successfully created');
        }
    }

    async deleteDB(client: PoolClient): Promise<void> {
        const tables = [
            'wax_gbm_balances', 'wax_votes', 'wax_gbm_deltas'
        ];

        for (const table of tables) {
            await client.query('DELETE FROM ' + client.escapeIdentifier(table));
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
