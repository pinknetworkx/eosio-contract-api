import {NeftyDropsContext} from '../index';
import { RequestValues } from '../../utils';
import { formatCollection } from '../../atomicassets/format';
import { ApiError } from '../../../error';
import QueryBuilder from '../../../builder';
import { buildGreylistFilter } from '../../atomicassets/utils';
import {buildRangeCondition} from '../utils';
import { DB } from '../../../server';
import { filterQueryArgs } from '../../validation';

export async function getStatsCollectionsAction(params: RequestValues, ctx: NeftyDropsContext): Promise<any> {
    const args = filterQueryArgs(params, {
        symbol: {type: 'string', min: 1},
        match: {type: 'string', min: 1},

        before: {type: 'int', min: 1},
        after: {type: 'int', min: 1},

        collection_whitelist: {type: 'string', min: 1},
        collection_blacklist: {type: 'string', min: 1},
        only_whitelisted: {type: 'bool'},

        sort: {type: 'string', allowedValues: ['volume', 'sales'], default: 'volume'},
        order: {type: 'string', allowedValues: ['desc', 'asc'], default: 'desc'},
        page: {type: 'int', min: 1, default: 1},
        limit: {type: 'int', min: 1, max: 100, default: 100}
    });

    const symbol = await fetchSymbol(ctx.db, ctx.coreArgs.neftydrops_account, args.symbol);

    if (symbol === null) {
        throw new ApiError('Symbol not found');
    }

    let queryString = 'SELECT * FROM (' + buildCollectionStatsQuery(args.after, args.before) + ') x ' +
        'WHERE (volume IS NOT NULL) ';

    const queryValues = [ctx.coreArgs.atomicassets_account, args.symbol];
    let varCounter = queryValues.length;

    if (args.match) {
        queryString += 'AND collection_name ILIKE $' + ++varCounter + ' ';
        queryValues.push('%' + args.match + '%');
    }

    if (args.collection_whitelist) {
        queryString += 'AND collection_name = ANY ($' + ++varCounter + ') ';
        queryValues.push(args.collection_whitelist.split(','));
    }

    if (args.collection_blacklist) {
        queryString += 'AND NOT (collection_name = ANY ($' + ++varCounter + ')) ';
        queryValues.push(args.collection_blacklist.split(','));
    }

    if (typeof args.only_whitelisted === 'boolean') {
        if (args.only_whitelisted) {
            queryString += 'AND collection_name = ANY (' +
                'SELECT DISTINCT(collection_name) ' +
                'FROM helpers_collection_list ' +
                'WHERE (list = \'whitelist\' OR list = \'verified\') AND (list != \'blacklist\' OR list != \'scam\')' +
                ')  ';
        }
    }

    const sortColumnMapping: { [key: string]: string } = {
        volume: 'volume',
        sales: 'sales'
    };

    const sortOrderMapping: { [key: string]: string } = {
        desc: 'DESC',
        asc: 'ASC'
    };

    const order = sortOrderMapping[args.order] || 'DESC';
    const column = sortColumnMapping[args.sort];
    const sortSuffix = column !== 'sales' ? `,sales ${order} NULLS LAST ` : '';

    // @ts-ignore
    queryString += `ORDER BY ${column} ${order} NULLS LAST ${sortSuffix} LIMIT $${++varCounter} OFFSET $${++varCounter}`;
    queryValues.push(args.limit);
    queryValues.push((args.page - 1) * args.limit);

    const query = await ctx.db.query(queryString, queryValues);
    return {symbol, results: query.rows.map(row => formatCollection(row))};
}

export async function getStatsCollectionAction(params: RequestValues, ctx: NeftyDropsContext): Promise<any> {
    const args = filterQueryArgs(params, {
        symbol: {type: 'string', min: 1},
    });

    const symbol = await fetchSymbol(ctx.db, ctx.coreArgs.neftydrops_account, args.symbol);

    if (!symbol) {
        throw new ApiError('Symbol not found');
    }

    const queryString = 'SELECT * FROM (' + buildCollectionStatsQuery() + ') x WHERE x.collection_name = $3 ';
    const queryValues = [ctx.coreArgs.atomicassets_account, args.symbol, ctx.pathParams.collection_name];

    const query = await ctx.db.query(queryString, queryValues);

    if (query.rowCount === 0) {
        throw new ApiError('Collection not found', 416);
    }

    return {symbol, result: formatCollection(query.rows[0])};
}

export async function getStatsAccountsAction(params: RequestValues, ctx: NeftyDropsContext): Promise<any> {
    const args = filterQueryArgs(params, {
        collection_whitelist: {type: 'string', min: 1, default: ''},
        collection_blacklist: {type: 'string', min: 1, default: ''},

        symbol: {type: 'string', min: 1},

        before: {type: 'int', min: 1},
        after: {type: 'int', min: 1},

        sort: {type: 'string', allowedValues: ['sell_volume', 'buy_volume'], default: 'sell_volume'},
        page: {type: 'int', min: 1, default: 1},
        limit: {type: 'int', min: 1, max: 100, default: 100}
    });

    const symbol = await fetchSymbol(ctx.db, ctx.coreArgs.neftydrops_account, args.symbol);

    if (!symbol) {
        throw new ApiError('Symbol not found');
    }

    let queryString = 'SELECT * FROM (' + buildAccountStatsQuery(args.after, args.before) + ') x ';
    const queryValues = [
        ctx.coreArgs.neftydrops_account, args.symbol,
        args.collection_whitelist.split(',').filter((x: string) => !!x),
        args.collection_blacklist.split(',').filter((x: string) => !!x)
    ];
    let varCounter = queryValues.length;

    const sortColumnMapping = {
        buy_volume: 'buy_volume'
    };

    // @ts-ignore
    queryString += 'ORDER BY ' + sortColumnMapping[args.sort] + ' DESC NULLS LAST ' +
        'LIMIT $' + ++varCounter + ' OFFSET $' + ++varCounter;
    queryValues.push(args.limit);
    queryValues.push((args.page - 1) * args.limit);

    const query = await ctx.db.query(queryString, queryValues);

    return {symbol, results: query.rows};
}

export async function getStatsAccountAction(params: RequestValues, ctx: NeftyDropsContext): Promise<any> {
    const args = filterQueryArgs(params, {
        collection_whitelist: {type: 'string', min: 1, default: ''},
        collection_blacklist: {type: 'string', min: 1, default: ''},

        symbol: {type: 'string', min: 1}
    });

    const symbol = await fetchSymbol(ctx.db, ctx.coreArgs.neftydrops_account, args.symbol);

    if (!symbol) {
        throw new ApiError('Symbol not found');
    }

    const queryString = 'SELECT * FROM (' + buildAccountStatsQuery() + ') x WHERE x.account = $5 ';
    const queryValues = [
        ctx.coreArgs.neftydrops_account, args.symbol,
        args.collection_whitelist.split(',').filter((x: string) => !!x),
        args.collection_blacklist.split(',').filter((x: string) => !!x),
        ctx.pathParams.account
    ];

    const query = await ctx.db.query(queryString, queryValues);

    if (query.rowCount === 0) {
        throw new ApiError('Account does not have any sold drops');
    }

    return {symbol, result: query.rows[0]};
}

export async function getStatsGraphAction(params: RequestValues, ctx: NeftyDropsContext): Promise<any> {
    const args = filterQueryArgs(params, {
        collection_whitelist: {type: 'string', min: 1, default: ''},
        collection_blacklist: {type: 'string', min: 1, default: ''},

        taker_marketplace: {type: 'string'},
        maker_marketplace: {type: 'string'},

        symbol: {type: 'string', min: 1},
        before: {type: 'int', min: 1},
        after: {type: 'int', min: 1}
    });

    const symbol = await fetchSymbol(ctx.db, ctx.coreArgs.neftydrops_account, args.symbol);

    if (!symbol) {
        throw new ApiError('Symbol not found');
    }

    let queryString = `SELECT div("time", 24 * 3600 * 1000) "time_block", COUNT(*) sales, SUM(price) volume 
                FROM neftydrops_stats
                WHERE market_contract = $1 AND symbol = $2
                    ${buildRangeCondition('"time"', args.after, args.before)}
                    ${getGreylistCondition('collection_name', 3, 4)}
               `;
    const queryValues = [
        ctx.coreArgs.neftydrops_account, args.symbol,
        args.collection_whitelist.split(',').filter((x: string) => !!x),
        args.collection_blacklist.split(',').filter((x: string) => !!x),
    ];

    queryString += 'GROUP BY "time_block" ORDER BY "time_block" ASC';

    const query = await ctx.db.query(queryString, queryValues);

    return {symbol, results: query.rows.map(row => ({sales: row.sales, volume: row.volume, time: String(row.time_block * 3600 * 24 * 1000)}))};
}

export async function getStatsSalesAction(params: RequestValues, ctx: NeftyDropsContext): Promise<any> {
    const args = filterQueryArgs(params, {
        symbol: {type: 'string', min: 1}
    });

    const symbol = await fetchSymbol(ctx.db, ctx.coreArgs.neftydrops_account, args.symbol);

    if (!symbol) {
        throw new ApiError('Symbol not found');
    }

    const query = new QueryBuilder('SELECT SUM(price) volume, COUNT(*) sales FROM neftydrops_stats');

    query.equal('drops_contract', ctx.coreArgs.neftydrops_account);
    query.equal('symbol', args.symbol);

    buildGreylistFilter(params, query, {collectionName: 'collection_name'});

    const result = await ctx.db.query(query.buildString(), query.buildValues());

    return {symbol, result: result.rows[0]};
}

function getGreylistCondition (column: string, whitelistVar: number, blacklistVar: number): string {
    return 'AND (' + column + ' = ANY ($' + whitelistVar + ') OR CARDINALITY($' + whitelistVar + ') = 0) AND ' +
        '(NOT (' + column + '  = ANY ($' + blacklistVar + ')) OR CARDINALITY($' + blacklistVar + ') = 0) ';
}

function buildCollectionStatsQuery(after?: number, before?: number): string {
    return `
        SELECT collection.*, t1.volume, t1.sales
        FROM
            atomicassets_collections_master collection
            LEFT JOIN (
                SELECT assets_contract contract, collection_name, SUM(price) volume, COUNT(*) sales FROM neftydrops_stats
                WHERE symbol = $2 ${buildRangeCondition('"time"', after, before)}
                GROUP BY assets_contract, collection_name
            ) t1 ON (collection.contract = t1.contract AND collection.collection_name = t1.collection_name)
        WHERE collection.contract = $1
        `;
}

function buildAccountStatsQuery(after?: number, before?: number): string {
    return `
        SELECT account, SUM(buy_volume_inner) buy_volume
        FROM (
            (
                SELECT buyer account, SUM(price) buy_volume_inner, 0 sell_volume_inner
                FROM neftydrops_stats
                WHERE drops_contract = $1 AND symbol = $2
                    ${buildRangeCondition('"time"', after, before)}
                    ${getGreylistCondition('collection_name', 3, 4)}
                GROUP BY buyer
            )
        ) accounts
        GROUP BY account
        `;
}

async function fetchSymbol(db: DB, contract: string, symbol: string): Promise<{token_symbol: string, token_contract: string, token_precision: number}> {
    if (!symbol) {
        return null;
    }

    const query = await db.query(
        'SELECT token_symbol, token_contract, token_precision FROM neftydrops_tokens WHERE drops_contract = $1 AND token_symbol = $2',
        [contract, symbol]
    );

    if (query.rows.length === 0) {
        return null;
    }

    return query.rows[0];
}
