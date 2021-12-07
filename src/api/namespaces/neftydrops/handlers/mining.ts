import {FilterDefinition, filterQueryArgs, RequestValues} from '../../utils';
import { NeftyDropsContext } from '../index';
import {buildRangeCondition} from '../utils';
import QueryBuilder from '../../../builder';

const sort_collection = {
    type: 'string',
    values: [
        'collection_name', 'sold_wax', 'sold_nefty'
    ],
    default: 'collection_name'
};
const sort_claimer = {
    type: 'string',
    values: [
        'claimer', 'spent_wax', 'spent_nefty'
    ],
    default: 'claimer'
};

export async function getCollectionsAction(params: RequestValues, ctx: NeftyDropsContext): Promise<any> {
    const args = filterQueryArgs(params, miningFilterQueryArgs(sort_collection));
    const group_by = 'collection_name';

    if (args.count) {
        const countQuery = await ctx.db.query(
            buildCountQuery(group_by, args.after, args.before),
            [ctx.coreArgs.neftydrops_account]
        );
        return countQuery.rows[0].count;
    }

    const queryString = `SELECT ${group_by},
          SUM( 
              CASE COALESCE(spent_symbol, 'NULL') 
                WHEN 'NULL' THEN (CASE settlement_symbol WHEN 'WAX' THEN final_price ELSE 0 END)
                WHEN 'NEFTY' THEN 0
                ELSE core_amount END
          ) AS sold_wax, 
          SUM(
              CASE settlement_symbol 
                WHEN 'NEFTY' THEN core_amount 
                ELSE 0 END
          ) AS sold_nefty `
        + buildClaimsQuery(args.after, args.before)
        + buildGroupQuery(group_by, args.sort, args.order, args.limit, args.page);
    const query = new QueryBuilder(queryString, [ctx.coreArgs.neftydrops_account]);
    const collectionSales = await ctx.db.query(query.buildString(), query.buildValues());
    return collectionSales.rows;
}

export async function getCollectionsCountAction(params: RequestValues, ctx: NeftyDropsContext): Promise<any> {
    return getCollectionsAction({...params, count: 'true'}, ctx);
}

export async function getClaimersAction(params: RequestValues, ctx: NeftyDropsContext): Promise<any> {
    const args = filterQueryArgs(params, miningFilterQueryArgs(sort_claimer));
    const group_by = 'claimer';

    if (args.count) {
        const countQuery = await ctx.db.query(
            buildCountQuery(group_by, args.after, args.before),
            [ctx.coreArgs.neftydrops_account]
        );
        return countQuery.rows[0].count;
    }

    const queryString = `SELECT ${group_by}, 
          SUM( 
              CASE COALESCE(spent_symbol, 'NULL') 
                WHEN 'NULL' THEN (CASE settlement_symbol WHEN 'WAX' THEN final_price ELSE 0 END)
                WHEN 'NEFTY' THEN 0
                ELSE core_amount END
          ) AS spent_wax, 
          SUM(
            CASE spent_symbol WHEN 'NEFTY' THEN core_amount ELSE 0 END
          ) AS spent_nefty `
        + buildClaimsQuery(args.after, args.before)
        + buildGroupQuery(group_by, args.sort, args.order, args.limit, args.page);
    const query = new QueryBuilder(queryString, [ctx.coreArgs.neftydrops_account]);
    const userPurchases = await ctx.db.query(query.buildString(), query.buildValues());
    return userPurchases.rows;
}

export async function getClaimersCountAction(params: RequestValues, ctx: NeftyDropsContext): Promise<any> {
    return getClaimersAction({...params, count: 'true'}, ctx);
}

function miningFilterQueryArgs(sort: any): FilterDefinition {
    return {
        before: {type: 'int', min: 1, default: 0},
        after: {type: 'int', min: 1, default: 0},
        page: {type: 'int', min: 1, default: 1},
        limit: {type: 'int', min: 1, max: 1000, default: 100},
        sort: sort,
        order: {type: 'string', values: ['asc', 'desc'], default: 'desc'},
        count: {type: 'bool'}
    };
}

function buildClaimsQuery(after?: number, before?: number): string {
    return ` FROM neftydrops_claims
             WHERE settlement_symbol IS DISTINCT FROM 'NULL'
                  AND drops_contract = $1
                  ${buildRangeCondition('"created_at_time"', after, before)}`;
}
function buildGroupQuery(group_by: string,
                         sort: string, order: string, limit: number, page: number): string {
    const offset = (page - 1) * limit;
    return ` GROUP BY ${group_by}
             ORDER BY ${sort} ${order}
             LIMIT ${limit}
             OFFSET ${offset}`;
}
function buildCountQuery(group_by: string,
                         after?: number, before?: number): string {
    return 'SELECT COUNT(*) count FROM ('
        + `SELECT ${group_by} `
        + buildClaimsQuery(after, before)
        + ` GROUP BY ${group_by}) AS grouped_claims`;
}
