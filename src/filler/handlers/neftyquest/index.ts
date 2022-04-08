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

export const NEFTYQUEST_BASE_PRIORITY = Math.max(ATOMICASSETS_BASE_PRIORITY) + 1000;

export type NeftyQuestArgs = {
    neftyquest_account: string,
    market_name: string,
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

        if (typeof args.market_name !== 'string') {
            throw new Error('NeftyQuest: Argument missing in neftyquest handler: market_name');
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
                    'volume_threshold_symbol, minimum_volume, minimum_volume_symbol, quest_attribute_name ' +
                ') ' +
                'VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)',
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
                    config.quest_attribute_name,
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

        this.filler.jobs.add('Refresh NeftyQuest leaderboards', 60000, JobQueuePriority.HIGH, (async () => {
            const now = new Date().getTime();
            const questsResult = await this.connection.database.query(
                'SELECT * FROM neftyquest_quests WHERE start_time < $1 AND end_time > $2',
                [now, now + 300_000]
            );
            for (let i = 0; i < questsResult.rows.length; i+= 1) {
                const quest = questsResult.rows[i];
                const viewName = `nefy_quest_leaderboard_${quest.quest_id}`;
                const matView = await this.connection.database.query('SELECT * FROM pg_matviews WHERE matviewname = $1;', [viewName]);
                if (matView.rowCount === 0) {
                    let materializedViewQuery = fs.readFileSync('./definitions/materialized/neftyquest_leaderboard_template.sql', { encoding: 'utf8' });
                    const questTemplates = quest.bonus
                        .filter(({ element }: any) => element.type === 'TEMPLATE')
                        .map(({ element}:  any) => element.template_id);
                    const tokens: { [key: string]: string } = {
                        '{{quest_id}}': quest.quest_id,
                        '{{marketplace}}': this.args.market_name,
                        '{{state}}': '3',
                        '{{start_time}}': quest.start_time.toString(),
                        '{{end_time}}': quest.end_time.toString(),
                        '{{total_to_collect}}': quest.bonus_threshold ? quest.bonus_threshold : questTemplates.length.toString(),
                        '{{completion_multiplier}}': quest.completion_multiplier,
                        '{{templates}}': questTemplates.join(','),
                        '{{volume_threshold}}': quest.volume_threshold,
                        '{{min_asset_value}}': quest.min_asset_value,
                        '{{points_per_asset}}': quest.points_per_asset,
                        '{{min_volume}}': quest.minimum_volume,
                    };
                    const expression = new RegExp(Object.keys(tokens).join('|'),'gi');
                    materializedViewQuery = materializedViewQuery.replace(expression, function(matched: string){
                        return tokens[matched];
                    });
                    await this.connection.database.query(materializedViewQuery);
                } else {
                    await this.connection.database.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY nefy_quest_leaderboard_${quest.quest_id};`);
                }
            }
        }));

        return (): any => destructors.map(fn => fn());
    }
}
