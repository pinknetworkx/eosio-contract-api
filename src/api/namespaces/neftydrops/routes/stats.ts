import * as express from 'express';

import { NeftyDropsNamespace } from '../index';
import { HTTPServer } from '../../../server';
import {filterQueryArgs, mergeRequestData} from '../../utils';
import { formatCollection } from '../../atomicassets/format';
import { atomicassetsComponents, greylistFilterParameters } from '../../atomicassets/openapi';
import { getOpenAPI3Responses, paginationParameters } from '../../../docs';
import QueryBuilder from '../../../builder';
import {buildGreylistFilter} from '../../atomicassets/utils';

export function statsEndpoints(core: NeftyDropsNamespace, server: HTTPServer, router: express.Router): any {
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
        SELECT collection.*, t1.volume, t1.sales
        FROM
            atomicassets_collections_master collection
            INNER JOIN (
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

    async function fetchSymbol(symbol: string): Promise<{token_symbol: string, token_contract: string, token_precision: number}> {
        if (!symbol) {
            return null;
        }

        const query = await server.query(
            'SELECT token_symbol, token_contract, token_precision FROM neftydrops_tokens WHERE drops_contract = $1 AND token_symbol = $2',
            [core.args.neftydrops_account, symbol]
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

                sort: {type: 'string', values: ['volume', 'sales'], default: 'volume'},
                order: {type: 'string', values: ['desc', 'asc'], default: 'desc'},
                page: {type: 'int', min: 1, default: 1},
                limit: {type: 'int', min: 1, max: 100, default: 100}
            });

            const symbol = await fetchSymbol(args.symbol);

            if (symbol === null) {
                return res.status(500).json({success: false, message: 'Symbol not found'});
            }

            let queryString = 'SELECT * FROM (' + buildCollectionStatsQuery(args.after, args.before) + ') x ' +
                'WHERE (volume IS NOT NULL) ';

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

                sort: {type: 'string', values: ['buy_volume'], default: 'buy_volume'},
                page: {type: 'int', min: 1, default: 1},
                limit: {type: 'int', min: 1, max: 100, default: 100}
            });

            const symbol = await fetchSymbol(args.symbol);

            if (symbol === null) {
                return res.status(500).json({success: false, message: 'Symbol not found'});
            }

            let queryString = 'SELECT * FROM (' + buildAccountStatsQuery(args.after, args.before) + ') x ';
            const queryValues = [
                core.args.neftydrops_account, args.symbol,
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
                core.args.neftydrops_account, args.symbol,
                args.collection_whitelist.split(',').filter((x: string) => !!x),
                args.collection_blacklist.split(',').filter((x: string) => !!x),
                req.params.account
            ];

            const query = await server.query(queryString, queryValues);

            if (query.rowCount === 0) {
                return res.status(416).json({success: false, message: 'Account does not have any sold drops'});
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


    router.all('/v1/stats/graph', server.web.caching({factor: 60}), async (req, res) => {
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

            let queryString = `SELECT div("time", 24 * 3600 * 1000) "time_block", COUNT(*) sales, SUM(price) volume
                FROM neftydrops_stats
                WHERE market_contract = $1 AND symbol = $2
                    ${buildRangeCondition('"time"', args.after, args.before)}
                    ${getGreylistCondition('collection_name', 3, 4)}
               `;
            const queryValues = [
                core.args.neftydrops_account, args.symbol,
                args.collection_whitelist.split(',').filter((x: string) => !!x),
                args.collection_blacklist.split(',').filter((x: string) => !!x),
            ];

            queryString += 'GROUP BY "time_block" ORDER BY "time_block" ASC';

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
                symbol: {type: 'string', min: 1}
            });

            const symbol = await fetchSymbol(args.symbol);

            if (symbol === null) {
                return res.status(500).json({success: false, message: 'Symbol not found'});
            }

            const query = new QueryBuilder('SELECT SUM(price) volume, COUNT(*) sales FROM neftydrops_stats');

            query.equal('drops_contract', core.args.neftydrops_account);
            query.equal('symbol', args.symbol);

            buildGreylistFilter(req, query, {collectionName: 'collection_name'});

            const result = await server.query(query.buildString(), query.buildValues());

            res.json({
                success: true,
                data: {symbol, result: result.rows[0]},
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
                    summary: 'Get market collections sorted by volume or sales',
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
                                enum: ['volume', 'sales'],
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
                    summary: 'Get market collections sorted by volume or sales',
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
                    summary: 'Get market collections sorted by volume or sales',
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
                    summary: 'Get collections sorted by volume',
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
                        ...greylistFilterParameters,
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
            '/v1/stats/graph': {
                get: {
                    tags: ['stats'],
                    summary: 'Get history of volume',
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
                        ...greylistFilterParameters
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
                        ...greylistFilterParameters
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
