import * as fs from 'fs';
import { PoolClient } from 'pg';

import { ContractHandler } from '../interfaces';
import logger from '../../../utils/winston';
import { ConfigTableRow } from './types/tables';
import Filler from '../../filler';
import DataProcessor from '../../processor';
import { configProcessor } from './processors/config';
import { linkProcessor } from './processors/links';
import { ATOMICASSETS_BASE_PRIORITY } from '../atomicassets';
import { logProcessor } from './processors/logs';

export const ATOMICTOOLS_BASE_PRIORITY = ATOMICASSETS_BASE_PRIORITY + 1000;

export type AtomicToolsArgs = {
    atomictools_account: string,
    atomicassets_account: string,
    store_logs: boolean
};

export enum AtomicToolsUpdatePriority {
    TABLE_CONFIG = ATOMICTOOLS_BASE_PRIORITY + 10,
    ACTION_CREATE_LINK = ATOMICTOOLS_BASE_PRIORITY + 20,
    ACTION_UPDATE_LINK = ATOMICTOOLS_BASE_PRIORITY + 30,
    LOGS = ATOMICASSETS_BASE_PRIORITY
}

export enum LinkState {
    WAITING = 0,
    CREATED = 1,
    CANCELED = 2,
    CLAIMED = 3
}

export default class AtomicToolsHandler extends ContractHandler {
    static handlerName = 'atomictools';

    readonly args: AtomicToolsArgs;

    config: ConfigTableRow;

    constructor(filler: Filler, args: {[key: string]: any}) {
        super(filler, args);

        if (typeof this.args.atomictools_account !== 'string') {
            throw new Error('AtomicTools: Argument missing in handler: atomictools_account');
        }

        if (typeof this.args.store_logs !== 'boolean') {
            throw new Error('AtomicTools: Argument missing in handler: store_logs');
        }
    }

    async init(client: PoolClient): Promise<void> {
        const existsQuery = await client.query(
            'SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2)',
            [await this.connection.database.schema(), 'atomictools_config']
        );

        const views = ['atomictools_links_master'];

        if (!existsQuery.rows[0].exists) {
            logger.info('Could not find AtomicTools tables. Create them now...');

            await client.query(fs.readFileSync('./definitions/tables/atomictools_tables.sql', {
                encoding: 'utf8'
            }));

            for (const view of views) {
                await client.query(fs.readFileSync('./definitions/views/' + view + '.sql', {encoding: 'utf8'}));
            }

            logger.info('AtomicTools tables successfully created');
        } else {
            for (const view of views) {
                await client.query(fs.readFileSync('./definitions/views/' + view + '.sql', {encoding: 'utf8'}));
            }
        }

        const configQuery = await client.query(
            'SELECT * FROM atomictools_config WHERE tools_contract = $1',
            [this.args.atomictools_account]
        );

        if (configQuery.rows.length === 0) {
            const configTable = await this.connection.chain.rpc.get_table_rows({
                json: true, code: this.args.atomictools_account,
                scope: this.args.atomictools_account, table: 'config'
            });

            if (configTable.rows.length === 0) {
                throw new Error('AtomicTools: Unable to fetch atomictools version');
            }

            const config: ConfigTableRow = configTable.rows[0];

            this.args.atomicassets_account = config.atomicassets_account;

            await client.query(
                'INSERT INTO atomictools_config ' +
                '(tools_contract, assets_contract, version) VALUES ($1, $2, $3)',
                [this.args.atomictools_account, this.args.atomicassets_account, config.version]
            );

            this.config = {...config};
        } else {
            this.args.atomicassets_account = configQuery.rows[0].assets_contract;

            this.config = {
                ...configQuery.rows[0],
                link_counter: 0,
                atomicassets_account: this.args.atomicassets_account
            };
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

    async register(processor: DataProcessor): Promise<() => any> {
        const destructors: Array<() => any> = [];

        destructors.push(configProcessor(this, processor));
        destructors.push(linkProcessor(this, processor));

        if (this.args.store_logs) {
            destructors.push(logProcessor(this, processor));
        }

        return (): any => destructors.map(fn => fn());
    }
}
