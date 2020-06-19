import * as fs from 'fs';
import { PoolClient } from 'pg';

import { ContractHandler } from '../interfaces';
import { ShipBlock } from '../../../types/ship';
import { EosioActionTrace, EosioTableRow, EosioTransaction } from '../../../types/eosio';
import { ContractDBTransaction } from '../../database';
import logger from '../../../utils/winston';
import StateReceiver from '../../receiver';

export type ResourcesArgs = {
    store_rammarket: boolean,
    store_bandwidth_deltas: boolean,
    store_bandwidth_balance: boolean
};

export default class ResourcesHandler extends ContractHandler {
    static handlerName = 'eosio.resources';

    readonly args: ResourcesArgs;

    constructor(reader: StateReceiver, args: {[key: string]: any}, minBlock: number = 0) {
        super(reader, args, minBlock);

        if (!this.args.store_rammarket) {
            logger.warn('eosio.resources: disabled store_rammarket');
        }

        if (!this.args.store_bandwidth_deltas) {
            logger.warn('eosio.resources: disabled store_bandwidth_deltas');
        }

        if (!this.args.store_bandwidth_balance) {
            logger.warn('eosio.resources: disabled store_bandwidth_balance');
        }

        this.scope = {
            actions: [ ],
            tables: [
                {
                    filter: 'eosio:rammarket',
                    deserialize: true
                },
                {
                    filter: 'eosio:resources',
                    deserialize: true
                }
            ]
        };
    }

    async init(client: PoolClient): Promise<void> {
        const existsQuery = await client.query(
            'SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2)',
            [await this.connection.database.schema(), 'ressource_balances']
        );

        if (!existsQuery.rows[0].exists) {
            logger.info('Could not find resource tables. Create them now...');

            await client.query(fs.readFileSync('./definitions/tables/wax_tables.sql', {
                encoding: 'utf8'
            }));

            logger.info('Resource tables successfully created');
        }
    }

    async deleteDB(client: PoolClient): Promise<void> {
        const tables = [
            'ressource_balances', 'ressource_rammarket', 'ressource_deltas'
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
