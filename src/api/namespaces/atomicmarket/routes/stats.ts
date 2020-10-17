import * as express from 'express';

import { AtomicMarketNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { filterQueryArgs, mergeRequestData } from '../../utils';
import { formatCollection } from '../../atomicassets/format';
import { SaleState } from '../../../../filler/handlers/atomicmarket';
import { atomicassetsComponents, greylistFilterParameters } from '../../atomicassets/openapi';
import { getOpenAPI3Responses, paginationParameters } from '../../../docs';
import { buildGreylistFilter } from '../../atomicassets/utils';

export function statsEndpoints(core: AtomicMarketNamespace, server: HTTPServer, router: express.Router): any {
    function getSubCondition (state: number, after?: number, before?: number): string {
        if (state === SaleState.LISTED.valueOf()) {
            return (
                typeof after === 'number' ? 'AND sale.created_at_time > ' + after + ' ' : ''
            ) + (
                typeof before === 'number' ? 'AND sale.created_at_time < ' + before + ' ' : ''
            );
        }

        if (state === SaleState.SOLD.valueOf()) {
            return (
                typeof after === 'number' ? 'AND sale.updated_at_time > ' + after + ' ' : ''
            ) + (
                typeof before === 'number' ? 'AND sale.updated_at_time < ' + before + ' ' : ''
            );
        }

        return '';
    }

    function getCollectionStatsQuery(after?: number, before?: number): string {
        return `
        SELECT collection.*, t1.volume, t1.listings, t1.sales
        FROM
            atomicassets_collections_master collection
            JOIN (
                SELECT 
                    sale.assets_contract contract, sale.collection_name, 
                    SUM(sale.final_price) FILTER(WHERE sale.state = ${SaleState.SOLD.valueOf()} ${getSubCondition(SaleState.SOLD.valueOf(), after, before)}) volume,
                    COUNT(*) FILTER(WHERE sale.state = ${SaleState.LISTED.valueOf()} ${getSubCondition(SaleState.LISTED.valueOf(), after, before)}) listings,
                    COUNT(*) FILTER(WHERE sale.state = ${SaleState.SOLD.valueOf()} ${getSubCondition(SaleState.SOLD.valueOf(), after, before)}) sales
                FROM atomicmarket_sales sale
                WHERE sale.settlement_symbol = $2
                GROUP BY sale.assets_contract, sale.collection_name
            ) t1 ON (collection.contract = t1.contract AND collection.collection_name = t1.collection_name)
        WHERE collection.contract = $1 
        `;
    }

    function getAccountStatsQuery(after?: number, before?: number): string {
        return `
        SELECT account, SUM(buy_volume_inner) buy_volume, SUM(sell_volume_inner) sell_volume
        FROM
            (
                (
                    SELECT buyer account, SUM(final_price) buy_volume_inner, 0 sell_volume_inner 
                    FROM atomicmarket_sales sale
                    WHERE sale.state = ${SaleState.SOLD.valueOf()} AND sale.settlement_symbol = $2 AND sale.market_contract = $1
                        ${getSubCondition(SaleState.SOLD.valueOf(), after, before)} AND 
                        (sale.collection_name = ANY ($3) OR CARDINALITY($3) = 0) AND (NOT (sale.collection_name = ANY ($4)) OR CARDINALITY($4) = 0)
                    GROUP BY buyer
                )
                UNION ALL
                (
                    SELECT seller account, 0 buy_volume_inner, SUM(final_price) sell_volume_inner 
                    FROM atomicmarket_sales sale
                    WHERE sale.state = ${SaleState.SOLD.valueOf()} AND sale.settlement_symbol = $2 AND sale.market_contract = $1
                        ${getSubCondition(SaleState.SOLD.valueOf(), after, before)} AND 
                        (sale.collection_name = ANY ($3) OR CARDINALITY($3) = 0) AND (NOT (sale.collection_name = ANY ($4)) OR CARDINALITY($4) = 0)
                    GROUP BY seller
                )
            ) accounts
        GROUP BY account
        `;
    }

    function getSchemaStatsQuery(after?: number, before?: number): string {
        return `
        SELECT "schema_name", 
            SUM(final_price) FILTER (WHERE "state" = ${SaleState.SOLD.valueOf()} ${getSubCondition(SaleState.SOLD.valueOf(), after, before)}) volume, 
            COUNT(*) FILTER (WHERE "state" = ${SaleState.LISTED.valueOf()} ${getSubCondition(SaleState.LISTED.valueOf(), after, before)}) listings
        FROM (
            SELECT sale.assets_contract, sale.sale_id, sale.state, sale.final_price, asset_a.schema_name
            FROM
                atomicmarket_sales sale, atomicassets_assets asset_a, atomicassets_offers_assets asset_o
            WHERE
                sale.assets_contract = asset_o.contract AND sale.offer_id = asset_o.offer_id AND
                asset_o.contract = asset_a.contract AND asset_o.asset_id = asset_a.asset_id AND
                sale.market_contract = $1 AND sale.settlement_symbol = $2 AND sale.collection_name = $3 AND 
                sale."state" IN (${SaleState.LISTED.valueOf()}, ${SaleState.SOLD.valueOf()})
            GROUP BY sale.assets_contract, sale.sale_id, sale.state, sale.final_price, asset_a.schema_name
        ) t1
        GROUP BY "schema_name"
        `;
    }

    function getMarketStatsQuery(after?: number, before?: number): string {
        return `
        SELECT 
            mp.market_contract, mp.marketplace_name,
            (
                SELECT COUNT(*) FROM (
                    (
                        SELECT seller account FROM atomicmarket_sales sale
                        WHERE sale.market_contract = mp.market_contract ${getSubCondition(SaleState.LISTED.valueOf(), after, before)} AND
                            (sale.maker_marketplace = mp.marketplace_name OR sale.taker_marketplace = mp.marketplace_name) AND
                            (sale.collection_name = ANY ($3) OR CARDINALITY($3) = 0) AND (NOT (sale.collection_name = ANY ($4)) OR CARDINALITY($4) = 0)
                    ) UNION (
                        SELECT buyer account FROM atomicmarket_sales sale
                        WHERE sale.state = ${SaleState.SOLD.valueOf()} AND sale.market_contract = mp.market_contract ${getSubCondition(SaleState.SOLD.valueOf(), after, before)} AND
                            (sale.maker_marketplace = mp.marketplace_name OR sale.taker_marketplace = mp.marketplace_name) AND 
                            (sale.collection_name = ANY ($3) OR CARDINALITY($3) = 0) AND (NOT (sale.collection_name = ANY ($4)) OR CARDINALITY($4) = 0)
                    )
                ) ut1
            ) users,
            (
                SELECT 
                    json_build_object(
                        'total', SUM(final_price),
                        'taker', SUM(final_price) FILTER (WHERE sale.taker_marketplace = mp.marketplace_name),
                        'maker', SUM(final_price) FILTER (WHERE sale.maker_marketplace = mp.marketplace_name)
                    )
                FROM atomicmarket_sales sale 
                WHERE
                    sale.state = ${SaleState.SOLD.valueOf()} AND sale.settlement_symbol = $2 AND
                    sale.market_contract = mp.market_contract ${getSubCondition(SaleState.SOLD.valueOf(), after, before)} AND
                    (sale.maker_marketplace = mp.marketplace_name OR sale.taker_marketplace = mp.marketplace_name) AND 
                    (sale.collection_name = ANY ($3) OR CARDINALITY($3) = 0) AND (NOT (sale.collection_name = ANY ($4)) OR CARDINALITY($4) = 0)
            ) volume
        FROM atomicmarket_marketplaces mp
        WHERE mp.market_contract = $1
        `;
    }

    function getGraphStatsQuery(): string {
        return `
        SELECT div(sale.updated_at_time, 24 * 3600 * 1000) "time", COUNT(*) sales, SUM(final_price) volume
        FROM atomicmarket_sales sale 
        WHERE "state" = ${SaleState.SOLD.valueOf()} AND market_contract = $1 AND settlement_symbol = $2 AND 
            (sale.collection_name = ANY ($3) OR CARDINALITY($3) = 0) AND (NOT (sale.collection_name = ANY ($4)) OR CARDINALITY($4) = 0)
        GROUP BY "time" ORDER BY "time" ASC
        `;
    }

    async function fetchSymbol(symbol: string): Promise<{token_symbol: string, token_contract: string, token_precision: number}> {
        if (!symbol) {
            return null;
        }

        const query = await server.query(
            'SELECT token_symbol, token_contract, token_precision FROM atomicassets_tokens WHERE contract = $1 AND token_symbol = $2',
            [core.args.atomicassets_account, symbol]
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

            let queryString = 'SELECT * FROM (' + getCollectionStatsQuery(args.after, args.before) + ') x WHERE (volume IS NOT NULL OR listings IS NOT NULL) ';
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

            const queryString = 'SELECT * FROM (' + getCollectionStatsQuery() + ') x WHERE x.collection_name = $3 ';
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

            let queryString = 'SELECT * FROM (' + getAccountStatsQuery(args.after, args.before) + ') x ';
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

            const queryString = 'SELECT * FROM (' + getAccountStatsQuery() + ') x WHERE x.account = $5 ';
            const queryValues = [
                core.args.atomicmarket_account, args.symbol,
                args.collection_whitelist.split(',').filter((x: string) => !!x),
                args.collection_blacklist.split(',').filter((x: string) => !!x),
                req.params.account
            ];

            const query = await server.query(queryString, queryValues);

            if (query.rowCount === 0) {
                return res.status(416).json({success: false, message: 'Account does not have any sales'});
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

            let queryString = 'SELECT * FROM (' + getSchemaStatsQuery(args.after, args.before) + ') x ';
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

            let queryString = 'SELECT * FROM (' + getMarketStatsQuery(args.after, args.before) + ') x ';
            const queryValues = [
                core.args.atomicmarket_account, args.symbol,
                args.collection_whitelist.split(',').filter((x: string) => !!x),
                args.collection_blacklist.split(',').filter((x: string) => !!x),
            ];

            // @ts-ignore
            queryString += 'ORDER BY users DESC NULLS LAST ';

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

            const queryString = getGraphStatsQuery();
            const queryValues = [
                core.args.atomicmarket_account, args.symbol,
                args.collection_whitelist.split(',').filter((x: string) => !!x),
                args.collection_blacklist.split(',').filter((x: string) => !!x),
            ];

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
