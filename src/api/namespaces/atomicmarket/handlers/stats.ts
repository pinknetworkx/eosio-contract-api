import {AtomicMarketContext, SaleApiState} from '../index';
import {SaleState} from '../../../../filler/handlers/atomicmarket';
import { buildBoundaryFilter, RequestValues } from '../../utils';
import {formatCollection, formatTemplate} from '../../atomicassets/format';
import {ApiError} from '../../../error';
import QueryBuilder from '../../../builder';
import { buildDataConditions, buildGreylistFilter } from '../../atomicassets/utils';
import {DB} from '../../../server';
import {filterQueryArgs} from '../../validation';

export async function getAllCollectionStatsAction(params: RequestValues, ctx: AtomicMarketContext): Promise<any> {
    const args = await filterQueryArgs(params, {
        symbol: {type: 'string', min: 1},
        match: {type: 'name'},
        search: {type: 'string', min: 1},

        before: {type: 'int', min: 1},
        after: {type: 'int', min: 1},

        collection_name: {type: 'list[name]'},
        collection_whitelist: {type: 'list[name]'},
        collection_blacklist: {type: 'list[name]'},

        sort: {type: 'string', allowedValues: ['volume', 'sales'], default: 'volume'},
        page: {type: 'int', min: 1, default: 1},
        limit: {type: 'int', min: 1, max: 100, default: 100}
    });

    const symbol = await fetchSymbol(ctx.db, ctx.coreArgs.atomicmarket_account, args.symbol);

    if (!symbol) {
        throw new ApiError('Symbol not found');
    }

    const query = new QueryBuilder(
        `SELECT collection.contract, collection.collection_name, COALESCE(stats.volume, 0) volume, COALESCE(stats.sales, 0) sales
        FROM atomicassets_collections collection LEFT JOIN (
            SELECT assets_contract, collection_name, SUM(price) volume, COUNT(*) sales 
            FROM atomicmarket_stats_markets t1
            WHERE t1.market_contract = $2 AND t1.symbol = $3 ${buildRangeCondition('"time"', args.after, args.before)}
            GROUP BY t1.assets_contract, t1.collection_name
        ) stats ON (collection.contract = stats.assets_contract AND collection.collection_name = stats.collection_name)`,
        [ctx.coreArgs.atomicassets_account, ctx.coreArgs.atomicmarket_account, args.symbol]
    );

    query.addCondition('collection.contract = $1');

    if (args.match) {
        query.addCondition(`collection.collection_name ILIKE ${query.addVariable(`%${query.escapeLikeVariable(args.match)}%`)}`);
    }

    if (args.search) {
        query.addCondition(`${query.addVariable(args.search)} <% (collection.collection_name || ' ' || COALESCE(collection.data->>'name', ''))`);
    }

    if (args.collection_name.length) {
        query.equalMany('collection.collection_name', args.collection_name);
    }

    if (args.collection_whitelist.length) {
        query.equalMany('collection.collection_name', args.collection_whitelist);
    }

    if (args.collection_blacklist.length) {
        query.notMany('collection.collection_name', args.collection_blacklist);
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

export async function getCollectionStatsAction(params: RequestValues, ctx: AtomicMarketContext): Promise<any> {
    const data = await getAllCollectionStatsAction({...params, collection_name: ctx.pathParams.collection_name}, ctx);

    if (data.results.length === 0) {
        throw new ApiError('Collection Not Found');
    }

    return {symbol: data.symbol, result: data.results[0]};
}

export async function getAllAccountStatsAction(params: RequestValues, ctx: AtomicMarketContext): Promise<any> {
    const args = await filterQueryArgs(params, {
        collection_whitelist: {type: 'list[name]'},
        collection_blacklist: {type: 'list[name]'},
        collection_name: {type: 'list[name]'},

        symbol: {type: 'string', min: 1},

        before: {type: 'int', min: 1},
        after: {type: 'int', min: 1},

        sort: {type: 'string', allowedValues: ['sell_volume', 'buy_volume'], default: 'sell_volume'},
        page: {type: 'int', min: 1, default: 1},
        limit: {type: 'int', min: 1, max: 100, default: 100}
    });

    const symbol = await fetchSymbol(ctx.db, ctx.coreArgs.atomicmarket_account, args.symbol);

    if (!symbol) {
        throw new ApiError('Symbol not found');
    }

    let queryString = buildAccountStatsQuery(args.after, args.before);
    const queryValues = [
        ctx.coreArgs.atomicmarket_account, args.symbol,
        [...args.collection_whitelist, ...args.collection_name],
        args.collection_blacklist
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

export async function getAccountStatsAction(params: RequestValues, ctx: AtomicMarketContext): Promise<any> {
    const args = await filterQueryArgs(params, {
        collection_whitelist: {type: 'list[name]'},
        collection_blacklist: {type: 'list[name]'},

        symbol: {type: 'string', min: 1}
    });

    const symbol = await fetchSymbol(ctx.db, ctx.coreArgs.atomicmarket_account, args.symbol);

    if (!symbol) {
        throw new ApiError('Symbol not found');
    }

    const queryString = buildAccountStatsQuery(null, null, '$5');
    const queryValues = [
        ctx.coreArgs.atomicmarket_account, args.symbol,
        args.collection_whitelist,
        args.collection_blacklist,
        ctx.pathParams.account
    ];

    const query = await ctx.db.query(queryString, queryValues);

    if (query.rowCount === 0) {
        return {symbol, result: {account: ctx.pathParams.account, sell_volume: '0', buy_volume: '0'}};
    }

    return {symbol, result: query.rows[0]};
}

export async function getSchemaStatsByCollectionV1Action(params: RequestValues, ctx: AtomicMarketContext): Promise<any> {
    const args = await filterQueryArgs(params, {
        symbol: {type: 'string', min: 1},
        match: {type: 'name'},

        before: {type: 'int', min: 1},
        after: {type: 'int', min: 1},

        sort: {type: 'string', allowedValues: ['volume', 'listings'], default: 'volume'}
    });

    const symbol = await fetchSymbol(ctx.db, ctx.coreArgs.atomicmarket_account, args.symbol);

    if (!symbol) {
        throw new ApiError('Symbol not found');
    }

    let queryString = 'SELECT * FROM (' + buildSchemaStatsQuery(args.after, args.before) + ') x ';
    const queryValues = [ctx.coreArgs.atomicmarket_account, args.symbol, ctx.pathParams.collection_name];
    let varCounter = queryValues.length;

    const sortColumnMapping = {
        volume: 'volume',
        listings: 'listings'
    };

    if (args.match) {
        queryString += 'WHERE schema_name ILIKE $' + ++varCounter + ' ';
        queryValues.push('%' + args.match + '%');
    }

    // @ts-ignore
    queryString += 'ORDER BY ' + sortColumnMapping[args.sort] + ' DESC NULLS LAST ';

    const query = await ctx.db.query(queryString, queryValues);

    return {symbol, results: query.rows};
}

export async function getSchemaStatsByCollectionV2Action(params: RequestValues, ctx: AtomicMarketContext): Promise<any> {
    const args = await filterQueryArgs(params, {
        symbol: {type: 'string', min: 1},

        before: {type: 'int', min: 1},
        after: {type: 'int', min: 1},

        sort: {type: 'string', allowedValues: ['volume', 'sales'], default: 'volume'}
    });

    const symbol = await fetchSymbol(ctx.db, ctx.coreArgs.atomicmarket_account, args.symbol);

    if (!symbol) {
        throw new ApiError('Symbol not found');
    }

    const statsQuery = new QueryBuilder(
        'SELECT schema.schema_name, SUM(price.price) volume, COUNT(*) sales ' +
        'FROM atomicmarket_stats_prices_master price, atomicassets_schemas "schema" '
    );

    statsQuery.addCondition('price.assets_contract = schema.contract AND price.schema_name = schema.schema_name AND price.collection_name = schema.collection_name');

    statsQuery.equal('price.market_contract', ctx.coreArgs.atomicmarket_account);
    statsQuery.equal('price.symbol', args.symbol);
    statsQuery.equal('price.collection_name', ctx.pathParams.collection_name);

    if (args.after) {
        statsQuery.addCondition('price.time > ' + statsQuery.addVariable(args.after) + '::BIGINT');
    }

    if (args.before) {
        statsQuery.addCondition('price.time < ' + statsQuery.addVariable(args.before) + '::BIGINT');
    }

    statsQuery.group(['schema.contract', 'schema.collection_name', 'schema.schema_name']);

    const schemaStatsQuery = new QueryBuilder(`
        WITH stats AS MATERIALIZED (
            ${statsQuery.buildString()}
        ), schemas AS MATERIALIZED (
            SELECT schema_name
            FROM atomicassets_asset_counts
    `, statsQuery.buildValues());

    schemaStatsQuery.equal('contract', ctx.coreArgs.atomicassets_account);
    schemaStatsQuery.equal('collection_name', ctx.pathParams.collection_name);
    schemaStatsQuery.group(['schema_name']);
    schemaStatsQuery.having('SUM(owned) > 0');

    const sortColumnMapping = {
        volume: 'volume',
        sales: 'sales'
    };
    schemaStatsQuery.append(`
        )

        SELECT
            schemas.schema_name,
            COALESCE(stats.volume, 0) volume,
            COALESCE(stats.sales, 0) sales
        FROM schemas
            LEFT OUTER JOIN stats USING (schema_name)
            
        ORDER BY ${sortColumnMapping[args.sort as keyof typeof sortColumnMapping]} DESC
    `);

    const {rows} = await ctx.db.query<{ schema_name: string, volume: string, sales: string }>(schemaStatsQuery.buildString(),
        schemaStatsQuery.buildValues()
    );

    const result = await ctx.db.query(
        `SELECT json_object_agg(schema_name, row_to_json(s)) schema_lookup
        FROM atomicassets_schemas_master s WHERE contract = $1 AND collection_name = $2 AND schema_name = ANY ($3)`,
        [ctx.coreArgs.atomicassets_account, ctx.pathParams.collection_name, rows.map((row: any) => row.schema_name)]
    );
    const schemaLookup: { [key: string]: any } = result.rows[0].schema_lookup || {};

    return {
        symbol,
        results: rows.map((row: any) => ({
            ...row,
            schema: schemaLookup[String(row.schema_name)]
        }))
    };
}

export async function getTemplateStatsAction(params: RequestValues, ctx: AtomicMarketContext): Promise<any> {
    const args = await filterQueryArgs(params, {
        symbol: {type: 'string', min: 1},

        collection_name: {type: 'list[name]'},
        schema_name: {type: 'list[name]'},
        template_id: {type: 'list[id]'},

        hide_unlisted_templates: {type: 'bool', default: false},

        search: {type: 'string', min: 1},

        sort: {type: 'string', allowedValues: ['volume', 'sales'], default: 'volume'},
        page: {type: 'int', min: 1, default: 1},
        limit: {type: 'int', min: 1, max: 1000, default: 100},

        before: {type: 'int', min: 1},
        after: {type: 'int', min: 1}
    });

    const symbol = await fetchSymbol(ctx.db, ctx.coreArgs.atomicmarket_account, args.symbol);

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
                FROM atomicmarket_stats_prices_master "asp"
                WHERE
                    "asp".assets_contract = $1 AND "asp".market_contract = $2 AND
                    "asp".symbol = $3 ${buildRangeCondition('"asp".time', args.after, args.before)}
                GROUP BY "asp".assets_contract, "asp".template_id 
            ) "stats" ON ("stats".template_id = "template".template_id AND "stats".assets_contract = "template".contract)
        `, [ctx.coreArgs.atomicassets_account, ctx.coreArgs.atomicmarket_account, args.symbol]
    );

    query.addCondition('template.contract = $1');

    await buildGreylistFilter(params, query, { collectionName: '"template".collection_name' });
    await buildBoundaryFilter(params, query, '"template".template_id', 'int', null);
    buildDataConditions(params, query, {templateTable: '"template"'});

    if (args.hide_unlisted_templates) {
        query.addCondition(`EXISTS(
            SELECT sale_id FROM atomicmarket_sales_filters_listed listing
            WHERE listing.assets_contract = template.contract AND array['t' || template.template_id] && listing.filter
        )`);
    }

    if (args.collection_name.length > 0) {
        query.equalMany('template.collection_name', args.collection_name);
    }

    if (args.schema_name.length > 0) {
        query.equalMany('template.schema_name', args.schema_name);
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
        'SELECT * FROM atomicassets_templates_master WHERE contract = $1 AND template_id = ANY ($2)',
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

export async function getMarketStatsAction(params: RequestValues, ctx: AtomicMarketContext): Promise<any> {
    const args = await filterQueryArgs(params, {
        collection_whitelist: {type: 'list[name]'},
        collection_blacklist: {type: 'list[name]'},

        symbol: {type: 'string', min: 1},
        before: {type: 'int', min: 1},
        after: {type: 'int', min: 1}
    });

    const symbol = await fetchSymbol(ctx.db, ctx.coreArgs.atomicmarket_account, args.symbol);

    if (!symbol) {
        throw new ApiError('Symbol not found');
    }

    let queryString = 'SELECT * FROM (' + buildMarketStatsQuery(args.after, args.before) + ') x ';
    const queryValues = [
        ctx.coreArgs.atomicmarket_account, args.symbol,
        args.collection_whitelist,
        args.collection_blacklist,
    ];

    // @ts-ignore
    queryString += 'ORDER BY maker_volume + taker_volume DESC NULLS LAST ';

    const query = await ctx.db.query(queryString, queryValues);

    return {
        symbol,
        results: query.rows
    };
}

export async function getStatsGraphAction(params: RequestValues, ctx: AtomicMarketContext): Promise<any> {
    const args = await filterQueryArgs(params, {
        collection_whitelist: {type: 'list[name]'},
        collection_blacklist: {type: 'list[name]'},

        taker_marketplace: {type: 'string'},
        maker_marketplace: {type: 'string'},

        symbol: {type: 'string', min: 1},
        before: {type: 'int', min: 1},
        after: {type: 'int', min: 1}
    });

    const symbol = await fetchSymbol(ctx.db, ctx.coreArgs.atomicmarket_account, args.symbol);

    if (!symbol) {
        throw new ApiError('Symbol not found');
    }

    let queryString = `SELECT div("time", 24 * 3600 * 1000) "time_block", COUNT(*) sales, SUM(price) volume, MAX(price) "max" 
                FROM atomicmarket_stats_markets
                WHERE market_contract = $1 AND symbol = $2
                    ${buildRangeCondition('"time"', args.after, args.before)}
                    ${getGreylistCondition('collection_name', 3, 4)}
               `;
    const queryValues = [
        ctx.coreArgs.atomicmarket_account, args.symbol,
        args.collection_whitelist,
        args.collection_blacklist,
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

export async function getStatsSalesAction(params: RequestValues, ctx: AtomicMarketContext): Promise<any> {
    const args = await filterQueryArgs(params, {
        symbol: {type: 'string', min: 1}
    });

    const symbol = await fetchSymbol(ctx.db, ctx.coreArgs.atomicmarket_account, args.symbol);

    if (!symbol) {
        throw new ApiError('Symbol not found');
    }

    const query = new QueryBuilder('SELECT SUM(final_price) volume, COUNT(*) sales FROM atomicmarket_sales');

    query.equal('market_contract', ctx.coreArgs.atomicmarket_account);
    query.equal('settlement_symbol', args.symbol);
    query.equal('state', SaleState.SOLD.valueOf());

    await buildGreylistFilter(params, query, {collectionName: 'collection_name'});

    const result = await ctx.db.query(query.buildString(), query.buildValues());

    return {symbol, result: result.rows[0]};
}

function getSaleSubCondition(state: SaleApiState, table: string, after?: number, before?: number, filterState: boolean = true): string {
    if (state.valueOf() === SaleApiState.LISTED.valueOf()) {
        let queryString = '';

        if (filterState) {
            queryString += 'AND ' + table + '.state = ' + SaleState.LISTED.valueOf() + ' ';
        }

        if (typeof after === 'number') {
            queryString += 'AND ' + table + '.created_at_time > ' + after + '::BIGINT ';
        }

        if (typeof before === 'number') {
            queryString += 'AND ' + table + '.created_at_time < ' + before + '::BIGINT ';
        }

        return queryString;
    } else if (state.valueOf() === SaleApiState.SOLD.valueOf()) {
        let queryString = '';

        if (filterState) {
            queryString += 'AND ' + table + '.state = ' + SaleState.SOLD.valueOf() + ' ';
        }

        if (typeof after === 'number') {
            queryString += 'AND ' + table + '.updated_at_time > ' + after + '::BIGINT ';
        }

        if (typeof before === 'number') {
            queryString += 'AND ' + table + '.updated_at_time < ' + before + '::BIGINT ';
        }

        return queryString;
    }

    throw new Error('Sale State not supported');
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
        FROM atomicmarket_stats_markets
            CROSS JOIN LATERAL UNNEST(ARRAY[buyer, seller]) u(account)
        WHERE market_contract = $1 AND symbol = $2
            ${account ? `AND (seller = ${account} OR buyer = ${account}) AND u.account = ${account}` :''} 
            ${buildRangeCondition('"time"', after, before)}
            ${getGreylistCondition('collection_name', 3, 4)}
        GROUP BY u.account
        `;
}

function buildSchemaStatsQuery(after?: number, before?: number): string {
    return `
        SELECT 
            asset.contract, asset.collection_name, asset.schema_name, 
            SUM(final_price) FILTER (WHERE 1 = 1 ${getSaleSubCondition(SaleApiState.SOLD, 'sale', after, before)}) volume, 
            COUNT(*) FILTER (WHERE 1 = 1 ${getSaleSubCondition(SaleApiState.SOLD, 'sale', after, before)}) sales, 
            COUNT(*) FILTER (WHERE 1 = 1 ${getSaleSubCondition(SaleApiState.LISTED, 'sale', after, before)}) listings
        FROM
            atomicmarket_sales sale, atomicassets_assets asset, atomicassets_offers_assets offer_asset
        WHERE
            sale.assets_contract = offer_asset.contract AND sale.offer_id = offer_asset.offer_id AND
            offer_asset.contract = asset.contract AND offer_asset.asset_id = asset.asset_id AND
            sale.market_contract = $1 AND sale.settlement_symbol = $2 AND sale.collection_name = $3 AND 
            sale."state" IN (${SaleState.LISTED.valueOf()}, ${SaleState.SOLD.valueOf()})
        GROUP BY asset.contract, asset.collection_name, asset.schema_name
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
                FROM atomicmarket_stats_markets
                WHERE market_contract = $1 AND symbol = $2 
                    ${buildRangeCondition('"time"', after, before)}
                    ${getGreylistCondition('collection_name', 3, 4)}
                GROUP BY market_contract, maker_marketplace
            ) UNION ALL (
                SELECT market_contract, taker_marketplace marketplace_name, 0 sellers, COUNT(DISTINCT buyer) buyers, 0 maker_volume, SUM(price) taker_volume
                FROM atomicmarket_stats_markets
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
        'SELECT token_symbol, token_contract, token_precision FROM atomicmarket_tokens WHERE market_contract = $1 AND token_symbol = $2',
        [contract, symbol]
    );

    if (query.rows.length === 0) {
        return null;
    }

    return query.rows[0];
}
