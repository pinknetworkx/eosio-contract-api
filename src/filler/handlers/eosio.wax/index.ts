import * as fs from 'fs';
import { PoolClient } from 'pg';

import { ContractHandler } from '../interfaces';
import { ShipBlock } from '../../../types/ship';
import { EosioActionTrace, EosioTableRow, EosioTransaction } from '../../../types/eosio';
import { ContractDBTransaction } from '../../database';
import ConnectionManager from '../../../connections/manager';
import { PromiseEventHandler } from '../../../utils/event';
import logger from '../../../utils/winston';

export type WaxArgs = {
    store_vote_weight: boolean,
    store_gbm_balances: boolean,
    store_gbm_deltas: boolean
};

export default class WaxHandler extends ContractHandler {
    static handlerName = 'eosio.wax';

    readonly args: WaxArgs;

    constructor(connection: ConnectionManager, events: PromiseEventHandler, args: {[key: string]: any}) {
        super(connection, events, args);

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

    async onBlockComplete(): Promise<void> { }
    async onCommit(): Promise<void> { }
}
