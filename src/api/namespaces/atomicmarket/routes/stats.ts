import * as express from 'express';

import { AtomicMarketNamespace, SaleApiState } from '../index';
import { HTTPServer } from '../../../server';
import { filterQueryArgs, mergeRequestData } from '../../utils';
import { formatCollection } from '../../atomicassets/format';
import { SaleState } from '../../../../filler/handlers/atomicmarket';
import { atomicassetsComponents, greylistFilterParameters } from '../../atomicassets/openapi';
import { getOpenAPI3Responses, paginationParameters } from '../../../docs';
import { buildGreylistFilter } from '../../atomicassets/utils';

export function statsEndpoints(core: AtomicMarketNamespace, server: HTTPServer, router: express.Router): any {
    function getSaleSubCondition (state: SaleApiState, table: string, after?: number, before?: number, filterState: boolean = true): string {
        if (state.valueOf() === SaleApiState.LISTED.valueOf()) {
            let queryString = '';

            if (filterState) {
                queryString += 'AND ' + table + '.state = ' + SaleState.LISTED.valueOf() + ' ';
            }

            if (typeof after === 'number') {
                queryString += 'AND ' + table + '.created_at_time > ' + after + ' ';
            }

            if (typeof before === 'number') {
                queryString += 'AND ' + table + '.created_at_time < ' + before + ' ';
            }

            return queryString;
        } else if (state.valueOf() === SaleApiState.SOLD.valueOf()) {
            let queryString = '';

            if (filterState) {
                queryString += 'AND ' + table + '.state = ' + SaleState.SOLD.valueOf() + ' ';
            }

            if (typeof after === 'number') {
                queryString += 'AND ' + table + '.updated_at_time > ' + after + ' ';
            }

            if (typeof before === 'number') {
                queryString += 'AND ' + table + '.updated_at_time < ' + before + ' ';
            }

            return queryString;
        }

        throw new Error('Sale State not supported');
    }

    function getGreylistCondition (column: string, whitelistVar: number, blacklistVar: number): string {
        return 'AND (' + column + ' = ANY ($' + whitelistVar + ') OR CARDINALITY($' + whitelistVar + ') = 0) AND ' +
            '(NOT (' + column + '  = ANY ($' + blacklistVar + ')) OR CARDINALITY($' + blacklistVar + ') = 0) ';
    }

    function buildRangeCondition(column: string, after?: number, before?: number): string {
        let queryStr = '';

        if (typeof after === 'number') {
            queryStr += 'AND ' + column + ' > ' + after + ' ';
        }

        if (typeof before === 'number') {
            queryStr += 'AND ' + column + ' < ' + before + ' ';
        }

        return queryStr;
    }

    function buildCollectionStatsQuery(after?: number, before?: number): string {
        return `
        SELECT collection.*, t1.volume, 0 listings, t1.sales
        FROM
            atomicassets_collections_master collection
            LEFT JOIN (
                SELECT assets_contract contract, collection_name, SUM(price) volume, COUNT(*) sales FROM atomicmarket_stats_markets
                WHERE symbol = $2 ${buildRangeCondition('"time"', after, before)}
                GROUP BY assets_contract, collection_name
            ) t1 ON (collection.contract = t1.contract AND collection.collection_name = t1.collection_name)
        WHERE collection.contract = $1 
        `;
    }

    function buildAccountStatsQuery(after?: number, before?: number): string {
        return `
        SELECT account, SUM(buy_volume_inner) buy_volume, SUM(sell_volume_inner) sell_volume
        FROM (
            (
                SELECT buyer account, SUM(price) buy_volume_inner, 0 sell_volume_inner 
                FROM atomicmarket_stats_markets
                WHERE market_contract = $1 AND symbol = $2 
                    ${buildRangeCondition('"time"', after, before)}
                    ${getGreylistCondition('collection_name', 3, 4)}
                GROUP BY buyer
            ) UNION ALL (
                SELECT seller account, 0 buy_volume_inner, SUM(price) sell_volume_inner 
                FROM atomicmarket_stats_markets
                WHERE market_contract = $1 AND symbol = $2 
                    ${buildRangeCondition('"time"', after, before)}
                    ${getGreylistCondition('collection_name', 3, 4)}
                GROUP BY seller
            )
        ) accounts
        GROUP BY account
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

    function buildGraphStatsQuery(): string {
        return `
        SELECT div("time", 24 * 3600 * 1000) "time_block", COUNT(*) sales, SUM(price) volume 
        FROM atomicmarket_stats_markets
        WHERE market_contract = $1 AND symbol = $2
            ${getGreylistCondition('collection_name', 3, 4)}
        GROUP BY "time_block" ORDER BY "time_block" ASC
        `;
    }

    async function fetchSymbol(symbol: string): Promise<{token_symbol: string, token_contract: string, token_precision: number}> {
        if (!symbol) {
            return null;
        }

        const query = await server.query(
            'SELECT token_symbol, token_contract, token_precision FROM atomicmarket_tokens WHERE market_contract = $1 AND token_symbol = $2',
            [core.args.atomicmarket_account, symbol]
        );

        if (query.rows.length === 0) {
            return null;
        }

        return query.rows[0];
    }

    router.all('/v1/stats/collections', server.web.caching(), async (req, res) => {
        try {
            const args = filterQueryArgs(req, {
                symbol: {type: 'string', min: 1},
                match: {type: 'string', min: 1},

                before: {type: 'int', min: 1},
                after: {type: 'int', min: 1},

                collection_whitelist: {type: 'string', min: 1},
                collection_blacklist: {type: 'string', min: 1},

                sort: {type: 'string', values: ['volume', 'listings', 'sales'], default: 'volume'},
                page: {type: 'int', min: 1, default: 1},
                limit: {type: 'int', min: 1, max: 100, default: 100}
            });

            const symbol = await fetchSymbol(args.symbol);

            if (symbol === null) {
                return res.status(500).json({success: false, message: 'Symbol not found'});
            }

            let queryString = 'SELECT * FROM (' + buildCollectionStatsQuery(args.after, args.before) + ') x ' +
                'WHERE (volume IS NOT NULL OR listings IS NOT NULL) ';

            const queryValues = [core.args.atomicassets_account, args.symbol];
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

            const sortColumnMapping = {
                volume: 'volume',
                listings: 'listings'
            };

            // @ts-ignore
            queryString += 'ORDER BY ' + sortColumnMapping[args.sort] + ' DESC NULLS LAST ' +
                'LIMIT $' + ++varCounter + ' OFFSET $' + ++varCounter;
            queryValues.push(args.limit);
            queryValues.push((args.page - 1) * args.limit);

            const query = await server.query(queryString, queryValues);

            res.json({
                success: true,
                data: {symbol, results: query.rows.map(row => formatCollection(row))},
                query_time: Date.now()
            });
        } catch (e) {
            res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    });

    router.all('/v1/stats/collections/:collection_name', server.web.caching(), async (req, res) => {
        try {
            const data = mergeRequestData(req);
            const symbol = await fetchSymbol(String(data.symbol));

            if (symbol === null) {
                return res.status(500).json({success: false, message: 'Symbol not found'});
            }

            const queryString = 'SELECT * FROM (' + buildCollectionStatsQuery() + ') x WHERE x.collection_name = $3 ';
            const queryValues = [core.args.atomicassets_account, data.symbol, req.params.collection_name];

            const query = await server.query(queryString, queryValues);

            if (query.rowCount === 0) {
                return res.status(416).json({success: false, message: 'Collection not found'});
            }

            res.json({
                success: true,
                data: {symbol, result: formatCollection(query.rows[0])},
                query_time: Date.now()
            });
        } catch (e) {
            res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    });

    router.all('/v1/stats/accounts', server.web.caching(), async (req, res) => {
        try {
            const args = filterQueryArgs(req, {
                collection_whitelist: {type: 'string', min: 1, default: ''},
                collection_blacklist: {type: 'string', min: 1, default: ''},

                symbol: {type: 'string', min: 1},

                before: {type: 'int', min: 1},
                after: {type: 'int', min: 1},

                sort: {type: 'string', values: ['sell_volume', 'buy_volume'], default: 'sell_volume'},
                page: {type: 'int', min: 1, default: 1},
                limit: {type: 'int', min: 1, max: 100, default: 100}
            });

            const symbol = await fetchSymbol(args.symbol);

            if (symbol === null) {
                return res.status(500).json({success: false, message: 'Symbol not found'});
            }

            let queryString = 'SELECT * FROM (' + buildAccountStatsQuery(args.after, args.before) + ') x ';
            const queryValues = [
                core.args.atomicmarket_account, args.symbol,
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

            const query = await server.query(queryString, queryValues);

            res.json({
                success: true,
                data: {symbol, results: query.rows},
                query_time: Date.now()
            });
        } catch (e) {
            res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    });

    router.all('/v1/stats/accounts/:account', server.web.caching(), async (req, res) => {
        try {
            const args = filterQueryArgs(req, {
                collection_whitelist: {type: 'string', min: 1, default: ''},
                collection_blacklist: {type: 'string', min: 1, default: ''},

                symbol: {type: 'string', min: 1}
            });

            const symbol = await fetchSymbol(args.symbol);

            if (symbol === null) {
                return res.status(500).json({success: false, message: 'Symbol not found'});
            }

            const queryString = 'SELECT * FROM (' + buildAccountStatsQuery() + ') x WHERE x.account = $5 ';
            const queryValues = [
                core.args.atomicmarket_account, args.symbol,
                args.collection_whitelist.split(',').filter((x: string) => !!x),
                args.collection_blacklist.split(',').filter((x: string) => !!x),
                req.params.account
            ];

            const query = await server.query(queryString, queryValues);

            if (query.rowCount === 0) {
                return res.status(416).json({success: false, message: 'Account does not have any ended listings'});
            }

            res.json({
                success: true,
                data: {symbol, result: query.rows[0]},
                query_time: Date.now()
            });
        } catch (e) {
            res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    });

    router.all('/v1/stats/schemas/:collection_name', server.web.caching(), async (req, res) => {
        try {
            const args = filterQueryArgs(req, {
                symbol: {type: 'string', min: 1},
                match: {type: 'string', min: 1},

                before: {type: 'int', min: 1},
                after: {type: 'int', min: 1},

                sort: {type: 'string', values: ['volume', 'listings'], default: 'volume'}
            });

            const symbol = await fetchSymbol(args.symbol);

            if (symbol === null) {
                return res.status(500).json({success: false, message: 'Symbol not found'});
            }

            let queryString = 'SELECT * FROM (' + buildSchemaStatsQuery(args.after, args.before) + ') x ';
            const queryValues = [core.args.atomicmarket_account, args.symbol, req.params.collection_name];
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

            const query = await server.query(queryString, queryValues);

            res.json({
                success: true,
                data: {symbol, results: query.rows},
                query_time: Date.now()
            });
        } catch (e) {
            res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    });

    router.all('/v1/stats/markets', server.web.caching(), async (req, res) => {
        try {
            const args = filterQueryArgs(req, {
                collection_whitelist: {type: 'string', min: 1, default: ''},
                collection_blacklist: {type: 'string', min: 1, default: ''},

                symbol: {type: 'string', min: 1},
                before: {type: 'int', min: 1},
                after: {type: 'int', min: 1}
            });

            const symbol = await fetchSymbol(args.symbol);

            if (symbol === null) {
                return res.status(500).json({success: false, message: 'Symbol not found'});
            }

            let queryString = 'SELECT * FROM (' + buildMarketStatsQuery(args.after, args.before) + ') x ';
            const queryValues = [
                core.args.atomicmarket_account, args.symbol,
                args.collection_whitelist.split(',').filter((x: string) => !!x),
                args.collection_blacklist.split(',').filter((x: string) => !!x),
            ];

            // @ts-ignore
            queryString += 'ORDER BY maker_volume + taker_volume DESC NULLS LAST ';

            const query = await server.query(queryString, queryValues);

            res.json({
                success: true,
                data: {
                    symbol,
                    results: query.rows
                },
                query_time: Date.now()
            });
        } catch (e) {
            res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    });

    router.all('/v1/stats/graph', server.web.caching(), async (req, res) => {
        try {
            const args = filterQueryArgs(req, {
                collection_whitelist: {type: 'string', min: 1, default: ''},
                collection_blacklist: {type: 'string', min: 1, default: ''},

                symbol: {type: 'string', min: 1}
            });

            const symbol = await fetchSymbol(args.symbol);

            if (symbol === null) {
                return res.status(500).json({success: false, message: 'Symbol not found'});
            }

            const queryString = buildGraphStatsQuery();
            const queryValues = [
                core.args.atomicmarket_account, args.symbol,
                args.collection_whitelist.split(',').filter((x: string) => !!x),
                args.collection_blacklist.split(',').filter((x: string) => !!x),
            ];

            const query = await server.query(queryString, queryValues);

            res.json({
                success: true,
                data: {symbol, results: query.rows.map(row => ({sales: row.sales, volume: row.volume, time: String(row.time_block * 3600 * 24 * 1000)}))},
                query_time: Date.now()
            });
        } catch (e) {
            res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    });

    router.all('/v1/stats/sales', server.web.caching(), async (req, res) => {
        try {
            const args = filterQueryArgs(req, {
                collection_whitelist: {type: 'string', min: 1, default: ''},
                collection_blacklist: {type: 'string', min: 1, default: ''},

                symbol: {type: 'string', min: 1}
            });

            const symbol = await fetchSymbol(args.symbol);

            if (symbol === null) {
                return res.status(500).json({success: false, message: 'Symbol not found'});
            }

            let queryString = `
                SELECT SUM(final_price) volume, COUNT(*) sales FROM atomicmarket_sales 
                WHERE market_contract = $1 and settlement_symbol = $2 AND state = ${SaleState.SOLD.valueOf()} 
            `;
            let queryValues = [core.args.atomicmarket_account, args.symbol];

            const greylistFilter = buildGreylistFilter(req, queryValues.length, 'collection_name');

            queryValues = queryValues.concat(greylistFilter.values);
            queryString += greylistFilter.str;

            const query = await server.query(queryString, queryValues);

            res.json({
                success: true,
                data: {symbol, result: query.rows[0]},
                query_time: Date.now()
            });
        } catch (e) {
            res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    });

    const SymbolResult = {
        type: 'object',
        properties: {
            token_contract: {type: 'string'},
            token_symbol: {type: 'string'},
            token_precision: {type: 'integer'}
        }
    };

    const CollectionResult = {
        type: 'object',
        properties: {
            ...atomicassetsComponents.Collection,
            listings: {type: 'string'},
            volume: {type: 'string'},
            sales: {type: 'string'}
        }
    };

    const AccountResult = {
        type: 'object',
        properties: {
            account: {type: 'string'},
            buy_volume: {type: 'string'},
            sell_volume: {type: 'string'}
        }
    };

    const SchemaResult = {
        type: 'object',
        properties: {
            schema_name: {type: 'string'},
            listings: {type: 'string'},
            volume: {type: 'string'}
        }
    };

    const boundaryParams = [
        {
            name: 'after',
            in: 'query',
            description: 'Only sales after this time',
            required: false,
            schema: {
                type: 'integer'
            }
        },
        {
            name: 'before',
            in: 'query',
            description: 'Only sales before this time',
            required: false,
            schema: {
                type: 'integer'
            }
        }
    ];

    return {
        tag: {
            name: 'stats',
            description: 'Stats'
        },
        paths: {
            '/v1/stats/collections': {
                get: {
                    tags: ['stats'],
                    summary: 'Get market collections sorted by volume or listings',
                    parameters: [
                        {
                            name: 'symbol',
                            in: 'query',
                            description: 'Token Symbol',
                            required: true,
                            schema: {
                                type: 'string'
                            }
                        },
                        ...boundaryParams,
                        ...paginationParameters,
                        ...greylistFilterParameters,
                        {
                            name: 'sort',
                            in: 'query',
                            description: 'Column to sort',
                            required: false,
                            schema: {
                                type: 'string',
                                enum: ['volume', 'listings'],
                                default: 'volume'
                            }
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 500], {
                        type: 'object',
                        properties: {
                            symbol: SymbolResult,
                            results: {type: 'array', items: CollectionResult}
                        }
                    })
                }
            },
            '/v1/stats/collections/{collection_name}': {
                get: {
                    tags: ['stats'],
                    summary: 'Get market collections sorted by volume or listings',
                    parameters: [
                        {
                            name: 'collection_name',
                            in: 'path',
                            description: 'Collection Name',
                            required: true,
                            schema: {
                                type: 'string'
                            }
                        },
                        {
                            name: 'symbol',
                            in: 'query',
                            description: 'Token Symbol',
                            required: true,
                            schema: {
                                type: 'string'
                            }
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 500], {
                        type: 'object',
                        properties: {
                            symbol: SymbolResult,
                            result: {type: 'array', items: CollectionResult}
                        }
                    })
                }
            },
            '/v1/stats/accounts': {
                get: {
                    tags: ['stats'],
                    summary: 'Get market collections sorted by volume or listings',
                    parameters: [
                        {
                            name: 'symbol',
                            in: 'query',
                            description: 'Token Symbol',
                            required: true,
                            schema: {
                                type: 'string'
                            }
                        },
                        ...boundaryParams,
                        ...greylistFilterParameters,
                        ...paginationParameters,
                        {
                            name: 'sort',
                            in: 'query',
                            description: 'Column to sort',
                            required: false,
                            schema: {
                                type: 'string',
                                enum: ['buy_volume', 'sell_volume'],
                                default: 'buy_volume'
                            }
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 500], {
                        type: 'object',
                        properties: {
                            symbol: SymbolResult,
                            results: {type: 'array', items: AccountResult}
                        }
                    })
                }
            },
            '/v1/stats/accounts/{account}': {
                get: {
                    tags: ['stats'],
                    summary: 'Get market collections sorted by volume or listings',
                    parameters: [
                        {
                            name: 'account',
                            in: 'path',
                            description: 'Account Name',
                            required: true,
                            schema: {
                                type: 'string'
                            }
                        },
                        {
                            name: 'symbol',
                            in: 'query',
                            description: 'Token Symbol',
                            required: true,
                            schema: {
                                type: 'string'
                            }
                        },
                        greylistFilterParameters
                    ],
                    responses: getOpenAPI3Responses([200, 500], {
                        type: 'object',
                        properties: {
                            symbol: SymbolResult,
                            result: {type: 'array', items: AccountResult}
                        }
                    })
                }
            },
            '/v1/stats/schemas/{collection_name}': {
                get: {
                    tags: ['stats'],
                    summary: 'Get market schemas sorted by volume or listings',
                    parameters: [
                        {
                            name: 'collection_name',
                            in: 'path',
                            description: 'Collection Name',
                            required: true,
                            schema: {
                                type: 'string'
                            }
                        },
                        {
                            name: 'symbol',
                            in: 'query',
                            description: 'Token Symbol',
                            required: true,
                            schema: {
                                type: 'string'
                            }
                        },
                        ...boundaryParams,
                        ...paginationParameters,
                        {
                            name: 'sort',
                            in: 'query',
                            description: 'Column to sort',
                            required: false,
                            schema: {
                                type: 'string',
                                enum: ['volume', 'listings'],
                                default: 'volume'
                            }
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 500], {
                        type: 'object',
                        properties: {
                            symbol: SymbolResult,
                            results: {type: 'array', items: SchemaResult}
                        }
                    })
                }
            },
            '/v1/stats/graph': {
                get: {
                    tags: ['stats'],
                    summary: 'Get history of volume and',
                    parameters: [
                        {
                            name: 'symbol',
                            in: 'query',
                            description: 'Token Symbol',
                            required: true,
                            schema: {
                                type: 'string'
                            }
                        },
                        greylistFilterParameters
                    ],
                    responses: getOpenAPI3Responses([200, 500], {
                        type: 'object',
                        properties: {
                            symbol: SymbolResult,
                            results: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        time: {type: 'string'},
                                        volume: {type: 'string'},
                                        sales: {type: 'string'}
                                    }
                                }
                            }
                        }
                    })
                }
            },
            '/v1/stats/sales': {
                get: {
                    tags: ['stats'],
                    summary: 'Get total sales and volume',
                    parameters: [
                        {
                            name: 'symbol',
                            in: 'query',
                            description: 'Token Symbol',
                            required: true,
                            schema: {
                                type: 'string'
                            }
                        },
                        greylistFilterParameters
                    ],
                    responses: getOpenAPI3Responses([200, 500], {
                        type: 'object',
                        properties: {
                            symbol: SymbolResult,
                            results: {
                                type: 'object',
                                properties: {
                                    volume: {type: 'string'},
                                    sales: {type: 'string'}
                                }
                            }
                        }
                    })
                }
            }
        }
    };
}
