import * as express from 'express';

import { AtomicMarketNamespace } from '../index';
import { HTTPServer } from '../../../server';
import logger from '../../../../utils/winston';
import { filterQueryArgs } from '../../utils';
import { formatCollection } from '../../atomicassets/format';
import { SaleState } from '../../../../filler/handlers/atomicmarket';
import { atomicassetsComponents } from '../../atomicassets/openapi';
import { getOpenAPI3Responses, paginationParameters } from '../../../docs';

export function statsEndpoints(core: AtomicMarketNamespace, server: HTTPServer, router: express.Router): any {
    function getCollectionStatsQuery(after?: number, before?: number): string {
        return `
        SELECT 
            collection.*, t1.volume, t1.listings, t1.sales,
            EXISTS (
                SELECT * FROM atomicmarket_blacklist_collections list
                WHERE list.assets_contract = collection.contract AND list.collection_name = collection.collection_name
            ) collection_blacklisted,
            EXISTS (
                SELECT * FROM atomicmarket_whitelist_collections list
                WHERE list.assets_contract = collection.contract AND list.collection_name = collection.collection_name
            ) collection_whitelisted
        FROM
            atomicassets_collections_master collection
            JOIN (
                SELECT 
                    sale.assets_contract contract, sale.collection_name, 
                    SUM(sale.final_price) FILTER(WHERE sale.state = ${SaleState.SOLD.valueOf()}) volume,
                    COUNT(*) FILTER(WHERE sale.state = ${SaleState.LISTED.valueOf()}) listings,
                    COUNT(*) FILTER(WHERE sale.state = ${SaleState.SOLD.valueOf()}) sales
                FROM atomicmarket_sales sale
                WHERE sale.settlement_symbol = $2
                GROUP BY sale.assets_contract, sale.collection_name
            ) t1 ON (collection.contract = t1.contract AND collection.collection_name = t1.collection_name)
        WHERE collection.contract = $1 
        `;
    }

    function getAccountStatsQuery(): string {
        return `
        SELECT account, SUM(buy_volume_inner) buy_volume, SUM(sell_volume_inner) sell_volume
        FROM
            (
                (
                    SELECT buyer account, SUM(final_price) buy_volume_inner, 0 sell_volume_inner 
                    FROM atomicmarket_sales sale
                    WHERE sale.state = ${SaleState.SOLD.valueOf()} AND sale.settlement_symbol = $2 AND sale.market_contract = $1
                    GROUP BY buyer
                )
                UNION ALL
                (
                    SELECT seller account, 0 buy_volume_inner, SUM(final_price) sell_volume_inner 
                    FROM atomicmarket_sales sale
                    WHERE sale.state = ${SaleState.SOLD.valueOf()} AND sale.settlement_symbol = $2 AND sale.market_contract = $1
                    GROUP BY seller
                )
            ) accounts
        GROUP BY account
        `;
    }

    function getSchemaStatsQuery(): string {
        return `
        SELECT "schema_name", 
            SUM(final_price) FILTER (WHERE "state" = ${SaleState.SOLD.valueOf()}) volume, 
            COUNT(*) FILTER (WHERE "state" = ${SaleState.LISTED.valueOf()}) listings
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

    function getGraphStatsQuery(): string {
        return `
        SELECT div(sale.updated_at_time, 24 * 3600 * 1000) "time", COUNT(*) sales, SUM(final_price) volume
        FROM atomicmarket_sales sale 
        WHERE "state" = ${SaleState.SOLD.valueOf()} AND market_contract = $1 AND settlement_symbol = $2
        GROUP BY "time" ORDER BY "time" ASC
        `;
    }

    async function fetchSymbol(symbol: string): Promise<{token_symbol: string, token_contract: string, token_precision: number}> {
        if (!symbol) {
            return null;
        }

        const query = await core.connection.database.query(
            'SELECT token_symbol, token_contract, token_precision FROM atomicassets_tokens WHERE contract = $1 AND token_symbol = $2',
            [core.args.atomicassets_account, symbol]
        );

        if (query.rows.length === 0) {
            return null;
        }

        return query.rows[0];
    }

    router.get('/v1/stats/collections', server.web.caching(), async (req, res) => {
        try {
            const args = filterQueryArgs(req, {
                collection_whitelisted: {type: 'bool'},
                symbol: {type: 'string', min: 1},
                match: {type: 'string', min: 1},

                sort: {type: 'string', values: ['volume', 'listings', 'sales'], default: 'volume'},
                page: {type: 'int', min: 1, default: 1},
                limit: {type: 'int', min: 1, max: 100, default: 100}
            });

            const symbol = await fetchSymbol(args.symbol);

            if (symbol === null) {
                return res.status(500).json({success: false, message: 'Symbol not found'});
            }

            let queryString = 'SELECT * FROM (' + getCollectionStatsQuery() + ') x WHERE (volume IS NOT NULL OR listings IS NOT NULL) ';
            const queryValues = [core.args.atomicassets_account, args.symbol];
            let varCounter = queryValues.length;

            if (args.match) {
                queryString += 'AND collection_name ILIKE $' + ++varCounter + ' ';
                queryValues.push('%' + args.match + '%');
            }

            if (typeof args.collection_whitelisted !== 'undefined') {
                if (args.collection_whitelisted) {
                    queryString += 'AND collection_whitelisted = TRUE ';
                } else {
                    queryString += 'AND collection_whitelisted = FALSE ';
                }
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

            logger.debug(queryString, queryValues);

            const query = await core.connection.database.query(queryString, queryValues);

            res.json({
                success: true,
                data: {symbol, results: query.rows.map(row => formatCollection(row))},
                query_time: Date.now()
            });
        } catch (e) {
            logger.error(req.originalUrl + ' ', e);

            res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    });

    router.get('/v1/stats/collections/:collection_name', server.web.caching(), async (req, res) => {
        try {
            const symbol = await fetchSymbol(String(req.query.symbol));

            if (symbol === null) {
                return res.status(500).json({success: false, message: 'Symbol not found'});
            }

            const queryString = 'SELECT * FROM (' + getCollectionStatsQuery() + ') x WHERE x.collection_name = $3 ';
            const queryValues = [core.args.atomicassets_account, req.query.symbol, req.params.collection_name];

            logger.debug(queryString, queryValues);

            const query = await core.connection.database.query(queryString, queryValues);

            if (query.rowCount === 0) {
                return res.status(416).json({success: false, message: 'Collection not found'});
            }

            res.json({
                success: true,
                data: {symbol, result: formatCollection(query.rows[0])},
                query_time: Date.now()
            });
        } catch (e) {
            logger.error(req.originalUrl + ' ', e);

            res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    });

    router.get('/v1/stats/accounts', server.web.caching(), async (req, res) => {
        try {
            const args = filterQueryArgs(req, {
                symbol: {type: 'string', min: 1},

                sort: {type: 'string', values: ['sell_volume', 'buy_volume'], default: 'sell_volume'},
                page: {type: 'int', min: 1, default: 1},
                limit: {type: 'int', min: 1, max: 100, default: 100}
            });

            const symbol = await fetchSymbol(args.symbol);

            if (symbol === null) {
                return res.status(500).json({success: false, message: 'Symbol not found'});
            }

            let queryString = 'SELECT * FROM (' + getAccountStatsQuery() + ') x ';
            const queryValues = [core.args.atomicmarket_account, args.symbol];
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

            logger.debug(queryString, queryValues);

            const query = await core.connection.database.query(queryString, queryValues);

            res.json({
                success: true,
                data: {symbol, results: query.rows},
                query_time: Date.now()
            });
        } catch (e) {
            logger.error(req.originalUrl + ' ', e);

            res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    });

    router.get('/v1/stats/accounts/:account', server.web.caching(), async (req, res) => {
        try {
            const symbol = await fetchSymbol(String(req.query.symbol));

            if (symbol === null) {
                return res.status(500).json({success: false, message: 'Symbol not found'});
            }

            const queryString = 'SELECT * FROM (' + getAccountStatsQuery() + ') x WHERE x.account = $3 ';
            const queryValues = [core.args.atomicmarket_account, req.query.symbol, req.params.account];

            logger.debug(queryString, queryValues);

            const query = await core.connection.database.query(queryString, queryValues);

            if (query.rowCount === 0) {
                return res.status(416).json({success: false, message: 'Account does not have any sales'});
            }

            res.json({
                success: true,
                data: {symbol, result: query.rows[0]},
                query_time: Date.now()
            });
        } catch (e) {
            logger.error(req.originalUrl + ' ', e);

            res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    });

    router.get('/v1/stats/schemas/:collection_name', server.web.caching(), async (req, res) => {
        try {
            const args = filterQueryArgs(req, {
                symbol: {type: 'string', min: 1},
                match: {type: 'string', min: 1},

                sort: {type: 'string', values: ['volume', 'listings'], default: 'volume'}
            });

            const symbol = await fetchSymbol(args.symbol);

            if (symbol === null) {
                return res.status(500).json({success: false, message: 'Symbol not found'});
            }

            let queryString = 'SELECT * FROM (' + getSchemaStatsQuery() + ') x ';
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

            logger.debug(queryString, queryValues);

            const query = await core.connection.database.query(queryString, queryValues);

            res.json({
                success: true,
                data: {symbol, results: query.rows},
                query_time: Date.now()
            });
        } catch (e) {
            logger.error(req.originalUrl + ' ', e);

            res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    });

    router.get('/v1/stats/graph', server.web.caching(), async (req, res) => {
        try {
            const symbol = await fetchSymbol(String(req.query.symbol));

            if (symbol === null) {
                return res.status(500).json({success: false, message: 'Symbol not found'});
            }

            const queryString = getGraphStatsQuery();
            const queryValues = [core.args.atomicmarket_account, req.query.symbol];

            logger.debug(queryString, queryValues);

            const query = await core.connection.database.query(queryString, queryValues);

            res.json({
                success: true,
                data: {symbol, results: query.rows},
                query_time: Date.now()
            });
        } catch (e) {
            logger.error(req.originalUrl + ' ', e);

            res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    });

    router.get('/v1/stats/sales', server.web.caching(), async (req, res) => {
        try {
            const symbol = await fetchSymbol(String(req.query.symbol));

            if (symbol === null) {
                return res.status(500).json({success: false, message: 'Symbol not found'});
            }

            const queryString = `
                SELECT SUM(final_price) volume, COUNT(*) sales FROM atomicmarket_sales 
                WHERE market_contract = $1 and settlement_symbol = $2 AND state = ${SaleState.SOLD.valueOf()}
            `;
            const queryValues = [core.args.atomicmarket_account, req.query.symbol];

            logger.debug(queryString, queryValues);

            const query = await core.connection.database.query(queryString, queryValues);

            res.json({
                success: true,
                data: {symbol, result: query.rows[0]},
                query_time: Date.now()
            });
        } catch (e) {
            logger.error(req.originalUrl + ' ', e);

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
            listings: {type: 'integer'},
            volume: {type: 'integer'},
            sales: {type: 'integer'},
        }
    };

    const AccountResult = {
        type: 'object',
        properties: {
            account: {type: 'string'},
            buy_volume: {type: 'integer'},
            sell_volume: {type: 'integer'}
        }
    };

    const SchemaResult = {
        type: 'object',
        properties: {
            schema_name: {type: 'string'},
            listings: {type: 'integer'},
            volume: {type: 'integer'}
        }
    };

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
                        },
                        ...paginationParameters,
                        {
                            name: 'sort',
                            in: 'query',
                            description: 'Column to sort',
                            required: false,
                            schema: {
                                type: 'string',
                                enum: ['volume', 'listings', 'sales'],
                                default: 'volume'
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
                        }
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
                                        time: {type: 'integer'},
                                        volume: {type: 'integer'},
                                        sales: {type: 'integer'}
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
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 500], {
                        type: 'object',
                        properties: {
                            symbol: SymbolResult,
                            results: {
                                type: 'object',
                                properties: {
                                    volume: {type: 'integer'},
                                    sales: {type: 'integer'}
                                }
                            }
                        }
                    })
                }
            }
        }
    };
}
