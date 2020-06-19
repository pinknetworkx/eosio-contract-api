import * as fs from 'fs';
import { PoolClient } from 'pg';

import { ContractHandler } from '../interfaces';
import { ShipBlock } from '../../../types/ship';
import { EosioTableRow } from '../../../types/eosio';
import { ContractDBTransaction } from '../../database';
import logger from '../../../utils/winston';
import StateReceiver from '../../receiver';

export type AtomicToolsArgs = {
    atomictools_account: string
};

export default class AtomicToolsHandler extends ContractHandler {
    static handlerName = 'atomictools';

    readonly args: AtomicToolsArgs;

    config: {
        version: string
    };

    constructor(reader: StateReceiver, args: {[key: string]: any}, minBlock: number = 0) {
        super(reader, args, minBlock);

        if (typeof this.args.atomictools_account !== 'string') {
            throw new Error('AtomicTools: Argument missing in handler: atomictools_account');
        }

        this.scope = {
            actions: [],
            tables: [
                {
                    filter: this.args.atomictools_account + ':*',
                    deserialize: true
                }
            ]
        };
    }

    async init(client: PoolClient): Promise<void> {
        const existsQuery = await client.query(
            'SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2)',
            [await this.connection.database.schema(), 'delphioracle_pairs']
        );

        if (!existsQuery.rows[0].exists) {
            logger.info('Could not find AtomicTools tables. Create them now...');

            await client.query(fs.readFileSync('./definitions/tables/atomictools_tables.sql', {
                encoding: 'utf8'
            }));

            logger.info('AtomicTools tables successfully created');
        }
    }

    async deleteDB(client: PoolClient): Promise<void> {
        const tables = ['atomictools_links', 'atomictools_links_assets', 'atomictools_config'];

        for (const table of tables) {
            await client.query(
                'DELETE FROM ' + client.escapeIdentifier(table) + ' WHERE tools_contract = $1',
                [this.args.atomictools_account]
            );
        }
    }

    async onTableChange(_db: ContractDBTransaction, _block: ShipBlock, _delta: EosioTableRow): Promise<void> {

    }

    async onAction(): Promise<void> { }

    async onBlockStart(): Promise<void> { }
    async onBlockComplete(_db: ContractDBTransaction, _block: ShipBlock): Promise<void> { }
    async onCommit(): Promise<void> { }
}
