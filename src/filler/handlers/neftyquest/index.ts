import * as fs from 'fs';
import {PoolClient} from 'pg';

import {ContractHandler} from '../interfaces';
import logger from '../../../utils/winston';
import {ConfigTableRow} from './types/tables';
import Filler from '../../filler';
import {ATOMICASSETS_BASE_PRIORITY} from '../atomicassets';
import DataProcessor from '../../processor';
import {configProcessor} from './processors/config';
import {JobQueuePriority} from '../../jobqueue';
import {preventInt64Overflow} from '../../../utils/binary';
import {initQuests, questsProcessor} from './processors/quests';
import {initBlends} from '../blends/processors/blends';
import {initSuperBlends} from '../blends/processors/superblends';

export const NEFTYQUEST_BASE_PRIORITY = Math.max(ATOMICASSETS_BASE_PRIORITY) + 1000;

export type NeftyQuestArgs = {
    neftyquest_account: string,
};

export enum NeftyQuestUpdatePriority {
    TABLE_CONFIG = NEFTYQUEST_BASE_PRIORITY + 10,
    TABLE_QUEST = NEFTYQUEST_BASE_PRIORITY + 20,
}

const views: string[] = [];
const materializedViews: string[] = [];

export default class NeftyQuestHandler extends ContractHandler {
    static handlerName = 'neftyquest';

    declare readonly args: NeftyQuestArgs;

    config: ConfigTableRow;

    static async setup(client: PoolClient): Promise<boolean> {
        const existsQuery = await client.query(
            'SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2)',
            ['public', 'neftyquest_config']
        );

        if (!existsQuery.rows[0].exists) {
            logger.info('Could not find NeftyQuest tables. Creating them now...');

            await client.query(fs.readFileSync('./definitions/tables/neftyquest_tables.sql', {
                encoding: 'utf8'
            }));

            for (const view of views) {
                await client.query(fs.readFileSync('./definitions/views/' + view + '.sql', {encoding: 'utf8'}));
            }

            for (const view of materializedViews) {
                await client.query(fs.readFileSync('./definitions/materialized/' + view + '.sql', {encoding: 'utf8'}));
            }

            logger.info('NeftyQuest tables successfully created');

            return true;
        }

        return false;
    }

    static async upgrade(): Promise<void> {

    }

    constructor(filler: Filler, args: {[key: string]: any}) {
        super(filler, args);

        if (typeof args.neftyquest_account !== 'string') {
            throw new Error('NeftyQuest: Argument missing in neftyquest handler: neftyquest_account');
        }
    }

    async init(client: PoolClient): Promise<void> {
        await this.connection.database.begin();
        const configQuery = await client.query(
            'SELECT * FROM neftyquest_config WHERE contract = $1',
            [this.args.neftyquest_account]
        );

        if (configQuery.rows.length === 0) {
            const configTable = await this.connection.chain.rpc.get_table_rows({
                json: true, code: this.args.neftyquest_account,
                scope: this.args.neftyquest_account, table: 'config'
            });

            if (configTable.rows.length === 0) {
                throw new Error('NeftyDrops: Unable to fetch neftydrops version');
            }

            const config: ConfigTableRow = configTable.rows[0];
            await client.query(
                'INSERT INTO neftyquest_config ' +
                '(' +
                    'contract, collection_name, template_id, ' +
                    'balance_attribute_name, quest_duration, points_per_asset, ' +
                    'min_asset_value, min_asset_value_symbol, points_per_volume, volume_threshold, ' +
                    'volume_threshold_symbol, minimum_volume, minimum_volume_symbol ' +
                ') ' +
                'VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)',
                [
                    this.args.neftyquest_account,
                    config.collection_name,
                    config.template_id,
                    config.balance_attribute_name,
                    config.quest_duration,
                    config.points_per_asset,
                    preventInt64Overflow(config.min_asset_value.split(' ')[0].replace('.', '')),
                    config.min_asset_value.split(' ')[1],
                    config.points_per_volume,
                    preventInt64Overflow(config.volume_threshold.split(' ')[0].replace('.', '')),
                    config.volume_threshold.split(' ')[1],
                    preventInt64Overflow(config.minimum_volume.split(' ')[0].replace('.', '')),
                    config.minimum_volume.split(' ')[1],
                ]
            );

            this.config = {
                ...config,
            };
        } else {
            this.config = {
                ...configQuery.rows[0],
            };
        }
        await initQuests(this.args, this.connection);
        await this.connection.database.query('COMMIT');
    }

    async deleteDB(client: PoolClient): Promise<void> {
        const tables = [
            'neftyquest_config', 'neftyquest_quests'
        ];

        for (const table of tables) {
            await client.query(
                'DELETE FROM ' + client.escapeIdentifier(table) + ' WHERE contract = $1',
                [this.args.neftyquest_account]
            );
        }

        for (const view of materializedViews) {
            await client.query('REFRESH MATERIALIZED VIEW ' + client.escapeIdentifier(view) + '');
        }
    }

    async register(processor: DataProcessor): Promise<() => any> {
        const destructors: Array<() => any> = [];

        destructors.push(configProcessor(this, processor));
        destructors.push(questsProcessor(this, processor));

        for (const view of materializedViews) {
            this.filler.jobs.add(`Refresh NeftyDrops View ${view}`, 60000, JobQueuePriority.MEDIUM, (async () => {
                await this.connection.database.query('REFRESH MATERIALIZED VIEW CONCURRENTLY ' + view + ';');
            }));
        }

        return (): any => destructors.map(fn => fn());
    }
}
