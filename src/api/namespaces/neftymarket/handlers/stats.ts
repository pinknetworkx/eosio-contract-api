import {NeftyMarketContext} from '../index';
import { buildBoundaryFilter, RequestValues } from '../../utils';
import {formatCollection, formatTemplate} from '../../atomicassets/format';
import {ApiError} from '../../../error';
import QueryBuilder from '../../../builder';
import { buildDataConditions, buildGreylistFilter } from '../../atomicassets/utils';
import {DB} from '../../../server';
import {filterQueryArgs} from '../../validation';

export async function getAllCollectionStatsAction(params: RequestValues, ctx: NeftyMarketContext): Promise<any> {
    const args = filterQueryArgs(params, {
        symbol: {type: 'string', min: 1},
        match: {type: 'string', min: 1},
        search: {type: 'string', min: 1},

        before: {type: 'int', min: 1},
        after: {type: 'int', min: 1},

        collection_name: {type: 'string', min: 1},
        collection_whitelist: {type: 'string[]', min: 1},
        collection_blacklist: {type: 'string[]', min: 1},
        only_whitelisted: {type: 'bool'},

        sort: {type: 'string', allowedValues: ['volume', 'sales'], default: 'volume'},
        page: {type: 'int', min: 1, default: 1},
        limit: {type: 'int', min: 1, max: 100, default: 100}
    });

    const symbol = await fetchSymbol(ctx.db, ctx.coreArgs.neftymarket_account, args.symbol);

    if (!symbol) {
        throw new ApiError('Symbol not found');
    }

    const query = new QueryBuilder(
        `SELECT collection.contract, collection.collection_name, COALESCE(stats.volume, 0) volume, COALESCE(stats.sales, 0) sales
        FROM atomicassets_collections collection LEFT JOIN (
            SELECT assets_contract, collection_name, SUM(price) volume, COUNT(*) sales 
            FROM neftymarket_stats_markets t1
            WHERE t1.market_contract = $2 AND t1.symbol = $3 ${buildRangeCondition('"time"', args.after, args.before)}
            GROUP BY t1.assets_contract, t1.collection_name
        ) stats ON (collection.contract = stats.assets_contract AND collection.collection_name = stats.collection_name)`,
        [ctx.coreArgs.atomicassets_account, ctx.coreArgs.neftymarket_account, args.symbol]
    );

    query.addCondition('collection.contract = $1');

    if (args.match) {
        query.addCondition(`collection.collection_name ILIKE ${query.addVariable(`%${args.match.replace('%', '').replace('_', '')}%`)}`);
    }

    if (args.search) {
        query.addCondition(`${query.addVariable(args.search)} <% (collection.collection_name || ' ' || COALESCE(collection.data->>'name', ''))`);
    }

    if (args.collection_name) {
        query.equal('collection.collection_name', args.collection_name);
    }

    if (args.collection_whitelist.length) {
        query.equalMany('collection.collection_name', args.collection_whitelist);
    }

    if (args.collection_blacklist.length) {
        query.notMany('collection.collection_name', args.collection_blacklist);
    }

    if (typeof args.only_whitelisted === 'boolean') {
        if (args.only_whitelisted) {
            query.addCondition('collection.collection_name IN (' +
                'SELECT DISTINCT(collection_name) ' +
                'FROM helpers_collection_list ' +
                'WHERE list = \'whitelist\' OR list = \'verified\' OR list = \'exceptions\')'
            );
            query.addCondition('collection.collection_name NOT IN (' +
                'SELECT DISTINCT(collection_name) ' +
                'FROM helpers_collection_list ' +
                'WHERE list = \'blacklist\' OR list = \'scam\')'
            );
        }
    }

    const sortColumnMapping: { [key: string]: string } = {
        volume: 'stats.volume',
        sales: 'stats.sales'
    };

    query.append(`ORDER BY ${sortColumnMapping[args.sort] || 'stats.volume'} DESC NULLS LAST, collection_name ASC`);
    query.paginate(args.page, args.limit);

    const collectionResult = await ctx.db.query(query.buildString(), query.buildValues());

    const result = await ctx.db.query(
        'SELECT * FROM atomicassets_collections_master WHERE contract = $1 AND collection_name = ANY($2)',
        [ctx.coreArgs.atomicassets_account, collectionResult.rows.map(row => row.collection_name)]
    );

    const collectionLookup: { [key: string]: any } = result.rows.reduce((prev, current) => {
        prev[String(current.collection_name)] = current;

        return prev;
    }, {});

    return {
        symbol,
        results: collectionResult.rows.map(row => formatCollection({...row, ...collectionLookup[row.collection_name]}))
    };
}

export async function getCollectionStatsAction(params: RequestValues, ctx: NeftyMarketContext): Promise<any> {
    const data = await getAllCollectionStatsAction({...params, collection_name: ctx.pathParams.collection_name}, ctx);

    if (data.results.length === 0) {
        throw new ApiError('Collection Not Found');
    }

    return {symbol: data.symbol, result: data.results[0]};
}

export async function getAllAccountStatsAction(params: RequestValues, ctx: NeftyMarketContext): Promise<any> {
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

    const symbol = await fetchSymbol(ctx.db, ctx.coreArgs.neftymarket_account, args.symbol);

    if (!symbol) {
        throw new ApiError('Symbol not found');
    }

    let queryString = buildAccountStatsQuery(args.after, args.before);
    const queryValues = [
        ctx.coreArgs.neftymarket_account, args.symbol,
        args.collection_whitelist.split(',').filter((x: string) => !!x),
        args.collection_blacklist.split(',').filter((x: string) => !!x)
    ];
    let varCounter = queryValues.length;

    const sortColumnMapping = {
        sell_volume: 'sell_volume',
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

export async function getAccountStatsAction(params: RequestValues, ctx: NeftyMarketContext): Promise<any> {
    const args = filterQueryArgs(params, {
        collection_whitelist: {type: 'string', min: 1, default: ''},
        collection_blacklist: {type: 'string', min: 1, default: ''},

        symbol: {type: 'string', min: 1}
    });

    const symbol = await fetchSymbol(ctx.db, ctx.coreArgs.neftymarket_account, args.symbol);

    if (!symbol) {
        throw new ApiError('Symbol not found');
    }

    const queryString = buildAccountStatsQuery(null, null, '$5');
    const queryValues = [
        ctx.coreArgs.neftymarket_account, args.symbol,
        args.collection_whitelist.split(',').filter((x: string) => !!x),
        args.collection_blacklist.split(',').filter((x: string) => !!x),
        ctx.pathParams.account
    ];

    const query = await ctx.db.query(queryString, queryValues);

    if (query.rowCount === 0) {
        return {symbol, result: {account: ctx.pathParams.account, sell_volume: '0', buy_volume: '0'}};
    }

    return {symbol, result: query.rows[0]};
}

export async function getSchemaStatsByCollectionAction(params: RequestValues, ctx: NeftyMarketContext): Promise<any> {
    const args = filterQueryArgs(params, {
        symbol: {type: 'string', min: 1},

        before: {type: 'int', min: 1},
        after: {type: 'int', min: 1}
    });

    const symbol = await fetchSymbol(ctx.db, ctx.coreArgs.neftymarket_account, args.symbol);

    if (!symbol) {
        throw new ApiError('Symbol not found');
    }

    const query = new QueryBuilder(
        'SELECT template.schema_name, SUM(price.price) volume, COUNT(*) sales ' +
        'FROM neftymarket_stats_prices_master price, atomicassets_templates "template" '
    );

    query.addCondition('price.assets_contract = template.contract AND price.template_id = template.template_id');

    query.equal('price.market_contract', ctx.coreArgs.neftymarket_account);
    query.equal('price.symbol', args.symbol);
    query.equal('price.collection_name', ctx.pathParams.collection_name);

    if (args.after) {
        query.addCondition('price.time > ' + query.addVariable(args.after) + '::BIGINT');
    }

    if (args.before) {
        query.addCondition('price.time < ' + query.addVariable(args.before) + '::BIGINT');
    }

    query.group(['template.contract', 'template.collection_name', 'template.schema_name']);

    const statsQuery = await ctx.db.query<{ schema_name: string, volume: string, sales: string }>(query.buildString(), query.buildValues());
    const schemasQuery = await ctx.db.query<{ schema_name: string }>(
        'SELECT schema_name ' +
        'FROM atomicassets_schemas "schema" WHERE contract = $1 AND collection_name = $2 AND EXISTS ( ' +
        'SELECT * FROM atomicassets_assets asset ' +
        'WHERE asset.contract = "schema".contract AND asset.collection_name = "schema".collection_name AND ' +
        'asset.schema_name = "schema".schema_name AND "owner" IS NOT NULL ' +
        ') ',
        [ctx.coreArgs.atomicassets_account, ctx.pathParams.collection_name]
    );

    const result = schemasQuery.rows.map(row => {
        const stats = statsQuery.rows.find(row2 => row.schema_name === row2.schema_name);

        return stats ?? {
            schema_name: row.schema_name,
            volume: '0',
            sales: '0'
        };
    });

    result.sort((a, b) => parseInt(b.volume, 10) - parseInt(a.volume, 10));

    return {symbol, results: result};
}

export async function getTemplateStatsAction(params: RequestValues, ctx: NeftyMarketContext): Promise<any> {
    const args = filterQueryArgs(params, {
        symbol: {type: 'string', min: 1},

        collection_name: {type: 'string[]', min: 1},
        schema_name: {type: 'string[]', min: 1},
        template_id: {type: 'string[]', min: 1},

        search: {type: 'string', min: 1},

        sort: {type: 'string', allowedValues: ['volume', 'sales'], default: 'volume'},
        page: {type: 'int', min: 1, default: 1},
        limit: {type: 'int', min: 1, max: 1000, default: 100},

        before: {type: 'int', min: 1},
        after: {type: 'int', min: 1}
    });

    const symbol = await fetchSymbol(ctx.db, ctx.coreArgs.neftymarket_account, args.symbol);

    if (!symbol) {
        throw new ApiError('Symbol not found');
    }

    const query = new QueryBuilder(
        `
            SELECT 
                "template"."template_id", 
                COALESCE("stats"."volume", 0) "volume", 
                COALESCE("stats"."sales", 0) "sales" 
            FROM atomicassets_templates "template"
            LEFT JOIN (
                SELECT assets_contract, template_id, SUM(price) "volume", COUNT(*) "sales" 
                FROM neftymarket_stats_prices_master "asp"
                WHERE
                    "asp".assets_contract = $1 AND "asp".market_contract = $2 AND
                    "asp".symbol = $3 ${buildRangeCondition('"asp".time', args.after, args.before)}
                GROUP BY "asp".assets_contract, "asp".template_id 
            ) "stats" ON ("stats".template_id = "template".template_id AND "stats".assets_contract = "template".contract)
        `, [ctx.coreArgs.atomicassets_account, ctx.coreArgs.neftymarket_account, args.symbol]
    );

    query.addCondition('template.contract = $1');

    buildGreylistFilter(params, query, { collectionName: '"template".collection_name' });
    buildBoundaryFilter(params, query, '"template".template_id', 'int', null);
    buildDataConditions(params, query, {templateTable: '"template"'});

    if (args.collection_name.length > 0) {
        query.equalMany('template.collection_name', args.collection_name);
    }

    if (args.schema_name.length > 0) {
        query.equalMany('template.schema_name', args.schema_name);
    }

    if (args.template_id.length > 0) {
        query.equalMany('template.template_id', args.template_id);
    }

    if (args.search) {
        query.addCondition(`${query.addVariable(args.search)} <% (template.immutable_data->>'name')`);
    }

    if (args.sort === 'sales') {
        query.append('ORDER BY sales DESC NULLS LAST, template_id ASC');
    } else {
        query.append('ORDER BY volume DESC NULLS LAST, template_id ASC');
    }

    query.paginate(args.page, args.limit);

    const templateQuery = await ctx.db.query(query.buildString(), query.buildValues());

    const templateLookup: { [key: string]: any } = {};
    const result = await ctx.db.query(
        'SELECT * FROM neftyassets_templates_master WHERE contract = $1 AND template_id = ANY ($2)',
        [ctx.coreArgs.atomicassets_account, templateQuery.rows.map((row: any) => row.template_id)]
    );

    result.rows.forEach((row: any) => {
        templateLookup[String(row.template_id)] = row;
    });

    return {
        symbol,
        results: templateQuery.rows.map((row: any) => ({
            sales: row.sales,
            volume: row.volume,
            template: formatTemplate(templateLookup[String(row.template_id)])
        }))
    };
}

export async function getMarketStatsAction(params: RequestValues, ctx: NeftyMarketContext): Promise<any> {
    const args = filterQueryArgs(params, {
        collection_whitelist: {type: 'string', min: 1, default: ''},
        collection_blacklist: {type: 'string', min: 1, default: ''},

        symbol: {type: 'string', min: 1},
        before: {type: 'int', min: 1},
        after: {type: 'int', min: 1}
    });

    const symbol = await fetchSymbol(ctx.db, ctx.coreArgs.neftymarket_account, args.symbol);

    if (!symbol) {
        throw new ApiError('Symbol not found');
    }

    let queryString = 'SELECT * FROM (' + buildMarketStatsQuery(args.after, args.before) + ') x ';
    const queryValues = [
        ctx.coreArgs.neftymarket_account, args.symbol,
        args.collection_whitelist.split(',').filter((x: string) => !!x),
        args.collection_blacklist.split(',').filter((x: string) => !!x),
    ];

    // @ts-ignore
    queryString += 'ORDER BY maker_volume + taker_volume DESC NULLS LAST ';

    const query = await ctx.db.query(queryString, queryValues);

    return {
        symbol,
        results: query.rows
    };
}

export async function getStatsGraphAction(params: RequestValues, ctx: NeftyMarketContext): Promise<any> {
    const args = filterQueryArgs(params, {
        collection_whitelist: {type: 'string', min: 1, default: ''},
        collection_blacklist: {type: 'string', min: 1, default: ''},

        taker_marketplace: {type: 'string'},
        maker_marketplace: {type: 'string'},

        symbol: {type: 'string', min: 1},
        before: {type: 'int', min: 1},
        after: {type: 'int', min: 1}
    });

    const symbol = await fetchSymbol(ctx.db, ctx.coreArgs.neftymarket_account, args.symbol);

    if (!symbol) {
        throw new ApiError('Symbol not found');
    }

    let queryString = `SELECT div("time", 24 * 3600 * 1000) "time_block", COUNT(*) sales, SUM(price) volume, MAX(price) "max" 
                FROM neftymarket_stats_markets
                WHERE market_contract = $1 AND symbol = $2
                    ${buildRangeCondition('"time"', args.after, args.before)}
                    ${getGreylistCondition('collection_name', 3, 4)}
               `;
    const queryValues = [
        ctx.coreArgs.neftymarket_account, args.symbol,
        args.collection_whitelist.split(',').filter((x: string) => !!x),
        args.collection_blacklist.split(',').filter((x: string) => !!x),
    ];
    let varCounter = queryValues.length;

    if (typeof args.taker_marketplace === 'string') {
        queryString += 'AND taker_marketplace = $' + ++varCounter + ' ';
        queryValues.push(args.taker_marketplace);
    }

    if (typeof args.maker_marketplace === 'string') {
        queryString += 'AND maker_marketplace = $' + ++varCounter + ' ';
        queryValues.push(args.maker_marketplace);
    }

    queryString += 'GROUP BY "time_block" ORDER BY "time_block" ASC';

    const query = await ctx.db.query(queryString, queryValues);

    return {
        symbol,
        results: query.rows.map(row => ({
            sales: row.sales,
            volume: row.volume,
            max: row.max,
            time: String(row.time_block * 3600 * 24 * 1000)
        }))
    };
}

function getGreylistCondition(column: string, whitelistVar: number, blacklistVar: number): string {
    return 'AND (' + column + ' = ANY ($' + whitelistVar + ') OR CARDINALITY($' + whitelistVar + ') = 0) AND ' +
        '(NOT (' + column + '  = ANY ($' + blacklistVar + ')) OR CARDINALITY($' + blacklistVar + ') = 0) ';
}

function buildRangeCondition(column: string, after?: number, before?: number): string {
    let queryStr = '';

    if (typeof after === 'number') {
        queryStr += ` AND ${column} > ${after} `;
    }

    if (typeof before === 'number') {
        queryStr += ` AND ${column} < ${before} `;
    }

    return queryStr;
}

function buildAccountStatsQuery(after?: number, before?: number, account?: string): string {
    return `
        SELECT u.account,
            COALESCE(SUM(CASE WHEN u.account = buyer THEN price END), 0) buy_volume,
            COALESCE(SUM(CASE WHEN u.account = seller THEN price END), 0) sell_volume
        FROM neftymarket_stats_markets
            CROSS JOIN LATERAL UNNEST(ARRAY[buyer, seller]) u(account)
        WHERE market_contract = $1 AND symbol = $2
            ${account ? `AND (seller = ${account} OR buyer = ${account}) AND u.account = ${account}` :''} 
            ${buildRangeCondition('"time"', after, before)}
            ${getGreylistCondition('collection_name', 3, 4)}
        GROUP BY u.account
        `;
}

function buildMarketStatsQuery(after?: number, before?: number): string {
    return `
        SELECT 
            market_contract, marketplace_name, SUM(sellers) sellers, SUM(buyers) buyers, 
            SUM(maker_volume) maker_volume, SUM(taker_volume) taker_volume 
        FROM (
            (
                SELECT market_contract, maker_marketplace marketplace_name, COUNT(DISTINCT seller) sellers, 0 buyers, SUM(price) maker_volume, 0 taker_volume
                FROM neftymarket_stats_markets
                WHERE market_contract = $1 AND symbol = $2 
                    ${buildRangeCondition('"time"', after, before)}
                    ${getGreylistCondition('collection_name', 3, 4)}
                GROUP BY market_contract, maker_marketplace
            ) UNION ALL (
                SELECT market_contract, taker_marketplace marketplace_name, 0 sellers, COUNT(DISTINCT buyer) buyers, 0 maker_volume, SUM(price) taker_volume
                FROM neftymarket_stats_markets
                WHERE market_contract = $1 AND symbol = $2 
                    ${buildRangeCondition('"time"', after, before)}
                    ${getGreylistCondition('collection_name', 3, 4)}
                GROUP BY market_contract, taker_marketplace
            )
        ) t1
        GROUP BY market_contract, marketplace_name
        `;
}

async function fetchSymbol(db: DB, contract: string, symbol: string): Promise<{ token_symbol: string, token_contract: string, token_precision: number }> {
    if (!symbol) {
        return null;
    }

    const query = await db.query(
        'SELECT token_symbol, token_contract, token_precision FROM neftymarket_tokens WHERE market_contract = $1 AND token_symbol = $2',
        [contract, symbol]
    );

    if (query.rows.length === 0) {
        return null;
    }

    return query.rows[0];
}
