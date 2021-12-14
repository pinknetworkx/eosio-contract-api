import * as fs from 'fs';
import { PoolClient } from 'pg';

import { ContractHandler } from '../interfaces';
import logger from '../../../utils/winston';
import Filler from '../../filler';
import { ATOMICASSETS_BASE_PRIORITY } from '../atomicassets';
import DataProcessor from '../../processor';
import {collectionsProcessor, initCollections} from './processors/collections';

export const HELPERS_BASE_PRIORITY = ATOMICASSETS_BASE_PRIORITY + 2000;

export type CollectionsListArgs = {
    atomicassets_account: string,
    features_account: string,
    hub_tools_account: string,
};

export enum HelpersUpdatePriority {
    TABLE_FEATURES = HELPERS_BASE_PRIORITY + 10,
}

export default class HelpersHandler extends ContractHandler {
    static handlerName = 'helpers';

    declare readonly args: CollectionsListArgs;

    static async setup(client: PoolClient): Promise<boolean> {
        const existsQuery = await client.query(
            'SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2)',
            ['public', 'helpers_collection_list']
        );

        if (!existsQuery.rows[0].exists) {
            logger.info('Could not find Helpers tables. Creating them now...');

            await client.query(fs.readFileSync('./definitions/tables/helpers_tables.sql', {
                encoding: 'utf8'
            }));

            logger.info('Helpers tables successfully created');
            return true;
        }

        return false;
    }

    static async upgrade(): Promise<void> {

    }

    constructor(filler: Filler, args: {[key: string]: any}) {
        super(filler, args);

        if (typeof args.atomicassets_account !== 'string') {
            throw new Error('Helpers: Argument missing in helpers handler: atomicassets_account');
        }

        if (typeof args.features_account !== 'string') {
            throw new Error('Helpers: Argument missing in helpers handler: features_account');
        }

        if (typeof args.hub_tools_account !== 'string') {
            throw new Error('Helpers: Argument missing in helpers handler: hub_tools_account');
        }
    }

    async init(): Promise<void> {
        await initCollections(this.args, this.connection);
    }

    async deleteDB(client: PoolClient): Promise<void> {
        const tables = [
            'helpers_collection_list',
        ];

        for (const table of tables) {
            await client.query(
                'DELETE FROM ' + client.escapeIdentifier(table) + ' WHERE assets_contract = $1',
                [this.args.atomicassets_account]
            );
        }
    }

    async register(processor: DataProcessor): Promise<() => any> {
        const destructors: Array<() => any> = [];
        destructors.push(collectionsProcessor(this, processor));
        return (): any => destructors.map(fn => fn());
    }
}
