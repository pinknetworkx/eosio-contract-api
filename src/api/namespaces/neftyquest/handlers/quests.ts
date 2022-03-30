import {buildBoundaryFilter, RequestValues} from '../../utils';
import {NeftyQuestContext} from '../index';
import {ApiError} from '../../../error';
import QueryBuilder from '../../../builder';
import { filterQueryArgs } from '../../validation';
import {formatLeaderboard, formatQuest} from '../format';

export async function getQuestsAction(params: RequestValues, ctx: NeftyQuestContext): Promise<any> {
    const args = filterQueryArgs(params, {
        page: {type: 'int', min: 1, default: 1},
        limit: {type: 'int', min: 1, max: 5000, default: 100},
        before: {type: 'string'},
        sort: {
            type: 'string',
            allowedValues: [
                'quest_id', 'start_time', 'end_time',
            ],
            default: 'start_time'
        },
        order: {type: 'string', allowedValues: ['asc', 'desc'], default: 'asc'},
        count: {type: 'bool'}
    });

    const query = new QueryBuilder(`
        SELECT * 
        FROM neftyquest_quests quest 
    `);

    let dateColumn = 'quest.start_time';
    if (args.sort === 'start_time') {
        dateColumn = 'quest.start_time';
    } else if (args.sort === 'end_time') {
        dateColumn = 'quest.end_time';
    }

    query.equal('contract', ctx.coreArgs.neftyquest_account);

    buildBoundaryFilter(
        params, query, 'quest.quest_id', 'int',
        dateColumn
    );

    if (args.count) {
        const countQuery = await ctx.db.query(
            'SELECT COUNT(*) counter FROM (' + query.buildString() + ') x',
            query.buildValues()
        );

        return countQuery.rows[0].counter;
    }

    const sortMapping: {[key: string]: {column: string, nullable: boolean}}  = {
        quest_id: {column: 'quest.quest_id', nullable: false},
        start_time: {column: 'quest.start_time', nullable: false},
        end_time: {column: 'quest.end_time', nullable: false},
    };

    query.append('ORDER BY ' + sortMapping[args.sort].column + ' ' + args.order + ' ' + (sortMapping[args.sort].nullable ? 'NULLS LAST' : ''));
    query.append('LIMIT ' + query.addVariable(args.limit) + ' OFFSET ' + query.addVariable((args.page - 1) * args.limit));

    const resultQuery = await ctx.db.query(query.buildString(), query.buildValues());
    return resultQuery.rows.map(formatQuest);
}

export async function getQuestsCountAction(params: RequestValues, ctx: NeftyQuestContext): Promise<any> {
    return getQuestsAction({...params, count: 'true'}, ctx);
}

export async function getQuestAction(params: RequestValues, ctx: NeftyQuestContext): Promise<any> {
    const query = await ctx.db.query(
        'SELECT * FROM neftyquest_quests WHERE contract = $1 AND quest_id = $2',
        [ctx.coreArgs.neftyquest_account, ctx.pathParams.quest_id]
    );

    if (query.rowCount === 0) {
        throw new ApiError('Quest not found', 416);
    } else {
        return formatQuest(query.rows[0]);
    }
}

export async function getLeaderboardAction(params: RequestValues, ctx: NeftyQuestContext): Promise<any> {
    const args = filterQueryArgs(params, {
        page: {type: 'int', min: 1, default: 1},
        limit: {type: 'int', min: 1, max: 5000, default: 100},
        account_name: {type: 'string'},
        sort: {
            type: 'string',
            allowedValues: [
                'rank', 'experience', 'account',
            ],
            default: 'rank'
        },
        order: {type: 'string', allowedValues: ['asc', 'desc'], default: 'asc'},
        count: {type: 'bool'}
    });

    const questResult = await ctx.db.query(
        'SELECT * FROM neftyquest_quests WHERE contract = $1 AND quest_id = $2',
        [ctx.coreArgs.neftyquest_account, ctx.pathParams.quest_id]
    );

    if (questResult.rowCount === 0) {
        throw new ApiError('Quest not found', 416);
    }

    const [quest] = questResult.rows;

    const query = new QueryBuilder(`
        SELECT *
        FROM nefy_quest_leaderboard_${quest.quest_id} loaderboard
    `);

    if (args.account_name) {
        query.equal('account', args.account_name);
    }

    if (args.count) {
        const countQuery = await ctx.db.query(
            'SELECT COUNT(*) counter FROM (' + query.buildString() + ') x',
            query.buildValues()
        );

        return countQuery.rows[0].counter;
    }

    const sortMapping: {[key: string]: {column: string, nullable: boolean}}  = {
        rank: {column: 'rank', nullable: false},
        experience: {column: 'experience', nullable: false},
        account: {column: 'account', nullable: false},
    };

    query.append('ORDER BY ' + sortMapping[args.sort].column + ' ' + args.order + ' ' + (sortMapping[args.sort].nullable ? 'NULLS LAST' : ''));
    query.append('LIMIT ' + query.addVariable(args.limit) + ' OFFSET ' + query.addVariable((args.page - 1) * args.limit));

    const resultQuery = await ctx.db.query(query.buildString(), query.buildValues());
    return resultQuery.rows.map(formatLeaderboard);
}

export async function getLeaderboardCountAction(params: RequestValues, ctx: NeftyQuestContext): Promise<any> {
    return getLeaderboardAction({...params, count: 'true'}, ctx);
}
