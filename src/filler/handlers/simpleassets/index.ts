import * as fs from 'fs';
import { PoolClient } from 'pg';

import { ContractHandler } from '../interfaces';
import logger from '../../../utils/winston';
import DataProcessor from '../../processor';
import { assetProcessor } from './processors/assets';
import Filler from '../../filler';
import { authorProcessor } from './processors/authors';
import { TokenConfigsTableRow } from './types/tables';
import { configProcessor } from './processors/config';

export const SIMPLEASSETS_BASE_PRIORITY = 0;

export enum SimpleAssetsUpdatePriority {
    INDEPENDENT = SIMPLEASSETS_BASE_PRIORITY + 10,
    TABLE_CONFIG = SIMPLEASSETS_BASE_PRIORITY + 10,
    TABLE_AUTHORS = SIMPLEASSETS_BASE_PRIORITY + 20,
    ACTION_MINT_ASSET = SIMPLEASSETS_BASE_PRIORITY + 50,
    ACTION_UPDATE_ASSET = SIMPLEASSETS_BASE_PRIORITY + 60,
}

export type SimpleAssetsReaderArgs = {
    simpleassets_account: string,
    store_transfers: boolean,
};

export default class SimpleAssetsHandler extends ContractHandler {
    static handlerName = 'simpleassets';

    declare readonly args: SimpleAssetsReaderArgs;

    tokenconfigs: TokenConfigsTableRow;

    static async setup(client: PoolClient): Promise<boolean> {
        const existsQuery = await client.query(
            'SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2)',
            ['public', 'simpleassets_config']
        );

        if (!existsQuery.rows[0].exists) {
            logger.info('Could not find SimpleAssets tables. Create them now...');

            await client.query(fs.readFileSync('./definitions/tables/simpleassets_tables.sql', {
                encoding: 'utf8'
            }));

            logger.info('SimpleAssets tables successfully created');

            return true;
        }

        return false;
    }

    constructor(filler: Filler, args: {[key: string]: any}) {
        super(filler, args);

        if (typeof args.simpleassets_account !== 'string') {
            throw new Error('SimpleAssets: Argument missing in simpleassets handler: simpleassets_account');
        }

        if (!this.args.store_transfers) {
            logger.warn('SimpleAssets: disabled store_transfers');
        }
    }

    async init(client: PoolClient): Promise<void> {
        const configQuery = await client.query(
            'SELECT * FROM simpleassets_config WHERE contract = $1',
            [this.args.simpleassets_account]
        );

        if (configQuery.rows.length === 0) {
            const tokenconfigsTable = await this.connection.chain.rpc.get_table_rows({
                json: true, code: this.args.simpleassets_account,
                scope: this.args.simpleassets_account, table: 'tokenconfigs'
            });

            if (tokenconfigsTable.rows[0].standard !== 'simpleassets') {
                throw new Error('SimpleAssets: Contract not deployed on the account');
            }

            this.tokenconfigs = {
                version: tokenconfigsTable.rows[0].version,
                standard: tokenconfigsTable.rows[0].standard
            };

            if (tokenconfigsTable.rows.length > 0) {
                await client.query(
                    'INSERT INTO simpleassets_config (contract, version) VALUES ($1, $2)',
                    [this.args.simpleassets_account, tokenconfigsTable.rows[0].version]
                );
            } else {
                throw new Error('SimpleAssets: Tokenconfigs table empty');
            }
        } else {
            this.tokenconfigs = {
                version: configQuery.rows[0].version,
                standard: 'simpleassets'
            };
        }
    }

    async deleteDB(client: PoolClient): Promise<void> {
        const tables = [
            'simpleassets_assets', 'simpleassets_transfers', 'simpleassets_transfers_assets',
            'simpleassets_config', 'simpleassets_authors'
        ];

        for (const table of tables) {
            await client.query(
                'DELETE FROM ' + client.escapeIdentifier(table) + ' WHERE contract = $1',
                [this.args.simpleassets_account]
            );
        }
    }

    async register(processor: DataProcessor): Promise<() => any> {
        const destructors: Array<() => any> = [];

        destructors.push(assetProcessor(this, processor));
        destructors.push(authorProcessor(this, processor));
        destructors.push(configProcessor(this, processor));

        return (): any => destructors.map(fn => fn());
    }
}
