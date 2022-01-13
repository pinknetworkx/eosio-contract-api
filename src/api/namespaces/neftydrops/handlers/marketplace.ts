import { RequestValues} from '../../utils';
import { NeftyDropsContext } from '../index';
import {buildRangeCondition} from '../utils';
import {SaleState} from '../../../../filler/handlers/atomicmarket';
import QueryBuilder from '../../../builder';
import {filterQueryArgs, FiltersDefinition} from '../../validation';

export async function getSellersAction(params: RequestValues, ctx: NeftyDropsContext): Promise<any> {
    const group_by = 'seller';
    const args = filterQueryArgs(params, marketFilterQueryArgs({
        type: 'string',
        allowedValues: [group_by, 'sold_wax'],
        default: group_by
    }));

    const parameters = [ctx.coreArgs.atomicmarket_account, ctx.coreArgs.neftymarket_name];
    const rangeCondition = buildRangeCondition('updated_at_time', args.after, args.before);
    const groupBy = buildGroupQuery(group_by);

    let collectionFilter = '';
    if (args.collection) {
        collectionFilter = ' AND collection_name = $3';
        parameters.push(args.collection);
    }

    let queryString = `
      SELECT ${group_by}, SUM(final_price) AS sold_wax
      FROM atomicmarket_sales
        WHERE state = ${SaleState.SOLD} 
          AND settlement_symbol = 'WAX'
          AND market_contract = $1
          AND maker_marketplace = $2
          ${collectionFilter}
          ${rangeCondition}
      ${groupBy}`;

    if (args.count) {
        queryString = `SELECT COUNT(*) FROM (${queryString}) AS res`;
    } else {
        queryString += buildLimitQuery(args.sort, args.order, args.limit, args.page);
    }

    const query = new QueryBuilder(queryString, parameters);
    const soldByUsers = await ctx.db.query(query.buildString(), query.buildValues());
    return args.count ? soldByUsers.rows[0].count : soldByUsers.rows;
}

export async function getSellersCountAction(params: RequestValues, ctx: NeftyDropsContext): Promise<any> {
    return getSellersAction({...params, count: 'true'}, ctx);
}

export async function getBuyersAction(params: RequestValues, ctx: NeftyDropsContext): Promise<any> {
    const group_by = 'buyer';
    const args = filterQueryArgs(params, marketFilterQueryArgs({
        type: 'string',
        allowedValues: [group_by, 'spent_wax'],
        default: group_by
    }));

    const parameters = [ctx.coreArgs.atomicmarket_account, ctx.coreArgs.neftymarket_name];
    const rangeCondition = buildRangeCondition('updated_at_time', args.after, args.before);
    const groupBy = buildGroupQuery(group_by);

    let collectionFilter = '';
    if (args.collection) {
        collectionFilter = ' AND collection_name = $3';
        parameters.push(args.collection);
    }

    let queryString = `
      SELECT ${group_by}, SUM(final_price) AS spent_wax
      FROM atomicmarket_sales
        WHERE state = ${SaleState.SOLD} 
          AND settlement_symbol = 'WAX'
          AND market_contract = $1
          AND taker_marketplace = $2
          ${collectionFilter}
          ${rangeCondition}
      ${groupBy}`;

    if (args.count) {
        queryString = `SELECT COUNT(*) FROM (${queryString}) AS res`;
    } else {
        queryString += buildLimitQuery(args.sort, args.order, args.limit, args.page);
    }

    const query = new QueryBuilder(queryString, parameters);
    const boughtByUsers = await ctx.db.query(query.buildString(), query.buildValues());
    return args.count ? boughtByUsers.rows[0].count : boughtByUsers.rows;
}

export async function getBuyersCountAction(params: RequestValues, ctx: NeftyDropsContext): Promise<any> {
    return getBuyersAction({...params, count: 'true'}, ctx);
}

export async function getCollectionsAction(params: RequestValues, ctx: NeftyDropsContext): Promise<any> {
    const group_by = 'collection_name';
    const args = filterQueryArgs(params, marketFilterQueryArgs({
        type: 'string',
        allowedValues: [group_by, 'sold_wax'],
        default: group_by
    }));

    const parameters = [ctx.coreArgs.atomicmarket_account, ctx.coreArgs.neftymarket_name];
    const rangeCondition = buildRangeCondition('updated_at_time', args.after, args.before);
    const groupBy = buildGroupQuery(group_by);

    let collectionFilter = '';
    if (args.collection) {
        collectionFilter = ' AND collection_name = $3';
        parameters.push(args.collection);
    }

    let queryString = `
      SELECT ${group_by}, SUM(final_price) AS sold_wax
      FROM atomicmarket_sales
        WHERE state = ${SaleState.SOLD} 
          AND settlement_symbol = 'WAX'
          AND market_contract = $1
          AND taker_marketplace = $2
          ${collectionFilter}
          ${rangeCondition}
      ${groupBy}`;

    if (args.count) {
        queryString = `SELECT COUNT(*) FROM (${queryString}) AS res`;
    } else {
        queryString += buildLimitQuery(args.sort, args.order, args.limit, args.page);
    }

    const query = new QueryBuilder(queryString, parameters);
    const soldByCollection = await ctx.db.query(query.buildString(), query.buildValues());
    return args.count ? soldByCollection.rows[0].count : soldByCollection.rows;
}

export async function getCollectionsCountAction(params: RequestValues, ctx: NeftyDropsContext): Promise<any> {
    return getCollectionsAction({...params, count: 'true'}, ctx);
}

function marketFilterQueryArgs(sort: any): FiltersDefinition {
    return {
        before: {type: 'int', min: 1, default: 0},
        after: {type: 'int', min: 1, default: 0},
        collection: {type: 'string'},
        page: {type: 'int', min: 1, default: 1},
        limit: {type: 'int', min: 1, max: 1000, default: 100},
        sort: sort,
        order: {type: 'string', allowedValues: ['asc', 'desc'], default: 'desc'},
        count: {type: 'bool'}
    };
}
function buildGroupQuery(group_by: string): string {
    return `GROUP BY ${group_by}`;
}
function buildLimitQuery(
    sort: string, order: string, limit: number, page: number): string {
    const offset = (page - 1) * limit;
    return `
      ORDER BY ${sort} ${order}
      LIMIT ${limit}
      OFFSET ${offset}`;
}
