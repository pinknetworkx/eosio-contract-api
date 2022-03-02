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

// @TODO: document how you get the trading volume and average reward
export async function getTradingVolumeAndAverage(params: RequestValues, ctx: NeftyDropsContext): Promise<any> {
    const args = filterQueryArgs(params, {
        before: {type: 'int', min: 1, default: 0},
        after: {type: 'int', min: 1, default: 0},
        total_nefty_reward: {type: 'float', min: 1, default: 10000}
    });
    
    // @NOTE: both: dropsTradingVolumeQuery and marketTradingVolumeQuery could be
    // executed in the same ctx.db.query, but the `pg` library won't let us because
    // it throws: 'cannot insert multiple commands into a prepared statement'

    const dropsRangeCondition = buildRangeCondition('created_at_time', args.after, args.before);
    const marketRangeCondition = buildRangeCondition('updated_at_time', args.after, args.before);

    let dropsTradingVolumesQueryString = `
        SELECT claimer, 
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
            ) AS sold_nefty
        FROM neftydrops_claims
        WHERE 
            settlement_symbol IS DISTINCT FROM 'NULL'
            AND drops_contract = $1
            ${dropsRangeCondition}
        GROUP BY claimer;`
    const dropsTradingVolumes = (await ctx.db.query(dropsTradingVolumesQueryString, [ctx.coreArgs.neftydrops_account])).rows;

    let marketTradingVolumesQueryString = `
        SELECT 
            seller, 
            buyer,
            maker_marketplace,
            taker_marketplace,
            final_price
        FROM atomicmarket_sales
        WHERE 
            state = ${SaleState.SOLD}
            AND settlement_symbol = 'WAX'
            AND market_contract = $1
            AND (maker_marketplace = $2 OR taker_marketplace = $2)
            ${marketRangeCondition}
    `;
    const marketTradingVolumes = (await ctx.db.query(marketTradingVolumesQueryString, [ctx.coreArgs.atomicmarket_account, ctx.coreArgs.neftymarket_name])).rows;

    let totalTradingVolume:number = 0;
    let beneficiaries = new Set<string>();

    for(let dropTradingVolume of dropsTradingVolumes){
        totalTradingVolume += parseFloat(dropTradingVolume.sold_wax);
        totalTradingVolume += parseFloat(dropTradingVolume.sold_nefty);
        beneficiaries.add(dropTradingVolume.claimer);
    }
    for(let marketTradingVolume of marketTradingVolumes){
        if(marketTradingVolume.maker_marketplace === ctx.coreArgs.neftymarket_name){
            totalTradingVolume += parseFloat(marketTradingVolume.final_price);
            beneficiaries.add(marketTradingVolume.seller);
        }
        if(marketTradingVolume.taker_marketplace === ctx.coreArgs.neftymarket_name){
            totalTradingVolume += parseFloat(marketTradingVolume.final_price);
            beneficiaries.add(marketTradingVolume.buyer);
        }
    }

    return { 
        trading_volume: totalTradingVolume, 
        averageReward:  args.total_nefty_reward / beneficiaries.size
    };
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
