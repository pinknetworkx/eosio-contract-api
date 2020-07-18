import * as express from 'express';

import { AtomicMarketNamespace } from '../index';
import { HTTPServer } from '../../../server';
import logger from '../../../../utils/winston';
import { filterQueryArgs } from '../../utils';
import { formatCollection } from '../../atomicassets/format';
import { SaleState } from '../../../../filler/handlers/atomicmarket';
import { assetFilterParameters, atomicassetsComponents, atomicDataFilter } from '../../atomicassets/openapi';
import { dateBoundaryParameters, getOpenAPI3Responses, paginationParameters, primaryBoundaryParameters } from '../../../docs';

export function statsEndpoints(core: AtomicMarketNamespace, server: HTTPServer, router: express.Router): any {
    function getCollectionStatsQuery(): string {
        return `
        SELECT 
            collection.*, volume_table.volume, listings_table.listings,
            EXISTS (
                SELECT * FROM atomicmarket_blacklist_collections list
                WHERE list.assets_contract = asset_a.contract AND list.collection_name = asset_a.collection_name
            ) collection_blacklisted,
            EXISTS (
                SELECT * FROM atomicmarket_whitelist_collections list
                WHERE list.assets_contract = asset_a.contract AND list.collection_name = asset_a.collection_name
            ) collection_whitelisted
        FROM
            atomicassets_collections_master collection
            LEFT JOIN (
                SELECT sale.assets_contract contract, sale.collection_name, SUM(sale.final_price) volume
                FROM atomicmarket_sales sale
                WHERE sale.state = ${SaleState.SOLD.valueOf()} AND sale.listing_symbol = $2
                GROUP BY sale.assets_contract, sale.collection_name
            ) volume_table ON (collection.contract = volume_table.contract AND collection.collection_name = volume_table.collection_name)
            LEFT JOIN (
                SELECT sale.assets_contract contract, sale.collection_name, COUNT(*) listings
                FROM atomicmarket_sales sale
                WHERE sale.state = ${SaleState.LISTED.valueOf()} AND sale.listing_symbol = $2
                GROUP BY sale.assets_contract, sale.collection_name
            ) listings_table ON (collection.contract = listings_table.contract AND collection.collection_name = listings_table.collection_name)
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
                    WHERE sale.state = ${SaleState.SOLD.valueOf()} GROUP BY buyer AND sale.listing_symbol = $2 AND sale.market_contract = $1
                )
                UNION ALL
                (
                    SELECT seller account, 0 buy_volume_inner, SUM(final_price) sell_volume_inner 
                    FROM atomicmarket_sales sale
                    WHERE sale.state = ${SaleState.SOLD.valueOf()} GROUP BY seller AND sale.listing_symbol = $2 AND sale.market_contract = $1
                )
            ) accounts
        GROUP BY account
        `;
    }

    function getSchemaStatsQuery(): string {
        return `
        SELECT "schema_name", 
            SUM(final_price) FILTER (WHERE "state" = 3) volume, 
            COUNT(*) FILTER (WHERE "state" = 1) listings
        FROM (
            SELECT sale.assets_contract, sale.sale_id, sale.state, sale.final_price, asset_a.schema_name
            FROM
                atomicmarket_sales sale, atomicassets_assets asset_a, atomicassets_offers_assets asset_o
            WHERE
                sale.assets_contract = asset_o.contract AND sale.offer_id = asset_o.offer_id AND
                asset_o.contract = asset_a.contract AND asset_o.asset_id = asset_a.asset_id AND
                sale.assets_contract = $1 AND sale.listing_symbol = $2 AND sale.collection_name = $3 AND 
                sale."state" IN (${SaleState.LISTED.valueOf()}, ${SaleState.SOLD.valueOf()})
            GROUP BY sale.assets_contract, sale.sale_id, sale.state, sale.final_price, asset_a.schema_name
        ) t1
        GROUP BY "schema_name"
        `;
    }

    async function fetchSymbol(symbol: string): Promise<{token_symbol: string, token_contract: string, token_precision: number}> {
        if (!symbol) {
            return null;
        }

        const query = await core.connection.database.query(
            'SELECT token_symbol, token_contract, token_precision WHERE contract = $1 AND token_symbol = $2',
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

                sort: {type: 'string', values: ['volume', 'listings'], default: 'volume'},
                page: {type: 'int', min: 1, default: 1},
                limit: {type: 'int', min: 1, max: 100, default: 100}
            });

            const symbol = await fetchSymbol(args.symbol);

            if (symbol === null) {
                return res.status(500).json({success: false, message: 'Symbol not found'});
            }

            let queryString = getCollectionStatsQuery() + 'AND volume IS NOT NULL OR listings IS NOT NULL';
            const queryValues = [core.args.atomicassets_account, args.symbol];
            let varCounter = queryValues.length;

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
            queryString += 'GROUP BY sale.collection_name ORDER BY ' + sortColumnMapping[args.sort] + ' DESC NULLS LAST ' +
                'LIMIT $' + ++varCounter + ' OFFSET $' + ++varCounter;
            queryValues.push(args.limit);
            queryValues.push((args.page - 1) * args.limit);

            logger.debug(queryString);

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

            const queryString = getCollectionStatsQuery() + ' AND collection.collection_name = $3';
            const queryValues = [core.args.atomicassets_account, req.query.symbol, req.params.collection_name];

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

            let queryString = 'SELECT * FROM (' + getAccountStatsQuery() + ') ';
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

            logger.debug(queryString);

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

            const queryString = 'SELECT * FROM (' + getAccountStatsQuery() + ') WHERE account = $3';
            const queryValues = [core.args.atomicassets_account, req.query.symbol, req.params.account];

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

                sort: {type: 'string', values: ['volume', 'listings'], default: 'volume'}
            });

            const symbol = await fetchSymbol(args.symbol);

            if (symbol === null) {
                return res.status(500).json({success: false, message: 'Symbol not found'});
            }

            let queryString = 'SELECT * FROM (' + getSchemaStatsQuery() + ') ';
            const queryValues = [core.args.atomicmarket_account, args.symbol, req.params.collection_name];
            let varCounter = queryValues.length;

            const sortColumnMapping = {
                volume: 'volume',
                listings: 'listings'
            };

            // @ts-ignore
            queryString += 'ORDER BY ' + sortColumnMapping[args.sort] + ' DESC NULLS LAST ' +
                'LIMIT $' + ++varCounter + ' OFFSET $' + ++varCounter;

            logger.debug(queryString);

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
            volume: {type: 'integer'}
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
                                enum: ['volume', 'listings'],
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
        }
    };
}
