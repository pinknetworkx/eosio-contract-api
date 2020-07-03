import * as express from 'express';

import { AtomicHubNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { filterQueryArgs } from '../../utils';
import { getOpenAPI3Responses } from '../../../docs';
import { formatListingAsset, formatSale } from '../../atomicmarket/format';
import { SaleState } from '../../../../filler/handlers/atomicmarket';
import { OfferState } from '../../../../filler/handlers/atomicassets';
import { fillSales } from '../../atomicmarket/filler';
import logger from '../../../../utils/winston';

export function statsEndpoints(core: AtomicHubNamespace, server: HTTPServer, router: express.Router): any {
    router.get('/v1/stats', server.web.caching({expire: 60, ignoreQueryString: true}), async (req, res) => {
        try {
            const args = filterQueryArgs(req, {
                symbol: {type: 'string', min: 1, max: 12, default: core.args.default_symbol}
            });

            const nftsQuery = await core.connection.database.query(
                'SELECT COUNT(*) as nfts FROM atomicassets_assets WHERE contract = $1',
                [core.args.atomicassets_account]
            );

            const transfersQuery = await core.connection.database.query(
                'SELECT COUNT(*) as transfers FROM atomicassets_transfers WHERE contract = $1 AND created_at_time >= $2',
                [core.args.atomicassets_account, Date.now() - 3600 * 24 * 1000]
            );

            const salesQuery = await core.connection.database.query(
                'SELECT COUNT(*) sales, SUM(final_price) volume FROM atomicmarket_sales ' +
                'WHERE market_contract = $1 AND state = $2 AND settlement_symbol = $3 AND updated_at_time >= $4',
                [core.args.atomicmarket_account, SaleState.SOLD.valueOf(), args.symbol.toUpperCase(), Date.now() - 3600 * 24 * 1000]
            );

            const symbolQuery = await core.connection.database.query(
                'SELECT token_contract, token_symbol, token_precision FROM atomicmarket_tokens WHERE market_contract = $1 AND token_symbol = $2',
                [core.args.atomicmarket_account, args.symbol]
            );

            if (symbolQuery.rowCount === 0) {
                return res.status(416).json({success: false, message: 'Symbol not found'});
            }

            res.json({
                success: true,
                data: {
                    symbol: symbolQuery.rows[0],
                    total: {
                        nfts: nftsQuery.rows[0]['nfts']
                    },
                    today: {
                        transactions: transfersQuery.rows[0]['transfers'],
                        sales_count: salesQuery.rows[0]['sales'],
                        sales_volume: salesQuery.rows[0]['volume']
                    }
                },
                query_time: Date.now()
            });
        } catch (e) {
            logger.error(req.originalUrl + ' ', e);

            return res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    });

    router.get('/v1/sales/trending', server.web.caching({expire: 60}), async (req, res) => {
        try {
            const args = filterQueryArgs(req, {
                limit: {type: 'int', min: 1, max: 100, default: 10}
            });

            const query = await core.connection.database.query(
                'SELECT * from atomicmarket_sales_master ' +
                'WHERE sale_state = $1 AND offer_state = $2 AND market_contract = $3 AND raw_token_symbol = $4 ' +
                'ORDER BY created_at_block DESC LIMIT $5',
                [
                    SaleState.LISTED.valueOf(), OfferState.PENDING.valueOf(),
                    core.args.atomicmarket_account, core.args.default_symbol, args.limit
                ]
            );

            // TODO do some market magic to find trending assets

            const sales = await fillSales(core.connection, core.args.atomicassets_account, query.rows.map(row => formatSale(row)));

            res.json({
                success: true,
                data: sales,
                query_time: Date.now()
            });
        } catch (e) {
            logger.error(req.originalUrl + ' ', e);

            return res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    });

    router.get('/v1/assets/suggestions', server.web.caching({expire: 60}), async (req, res) => {
        try {
            const args = filterQueryArgs(req, {
                limit: {type: 'int', min: 1, max: 100, default: 10},

                template_id: {type: 'int', min: 0},
                collection_name: {type: 'string', min: 1, max: 12},
                schema_name: {type: 'string', min: 1, max: 12},
                asset_id: {type: 'int', min: 1}
            });

            if (args.asset_id) {
                const asset = await core.connection.database.query(
                    'SELECT template_id, collection_name, schema_name FROM atomicassets_assets ' +
                    'WHERE contract = $1 AND asset_id = $2',
                    [core.args.atomicassets_account, args.asset_id]
                );

                if (asset.rowCount === 0) {
                    return res.status(416).json({success: false, message: 'Asset ID not found'});
                }

                args.template_id = asset.rows[0].template_id;
                args.collection_name = asset.rows[0].collection_name;
                args.schema_name = asset.rows[0].schema_name;
            }

            let assets = [];
            for (let i = 0; i <= 3 && assets.length === 0; i++) {
                const queryValues = [core.args.atomicassets_account];
                let queryString = 'SELECT * from atomicmarket_assets_master WHERE contract = $1 AND owner IS NOT NULL ';

                if (args.template_id && i <= 0) {
                    queryValues.push(args.template_id);
                    queryString += 'AND template_id = $' + queryValues.length + ' ';
                }

                if (args.schema_name && i <= 1) {
                    queryValues.push(args.schema_name);
                    queryString += 'AND schema_name = $' + queryValues.length + ' ';
                }

                if (args.collection_name && i <= 2) {
                    queryValues.push(args.collection_name);
                    queryString += 'AND collection_name = $' + queryValues.length + ' ';
                }

                if (args.asset_id) {
                    queryValues.push(args.asset_id);
                    queryString += 'AND asset_id != $' + queryValues.length + ' ';
                }

                queryValues.push(args.limit);
                queryString += 'ORDER BY minted_at_block DESC LIMIT $' + queryValues.length;

                const query = await core.connection.database.query(queryString, queryValues);

                assets = query.rows.map(row => formatListingAsset(row));
            }

            res.json({
                success: true,
                data: assets,
                query_time: Date.now()
            });
        } catch (e) {
            logger.error(req.originalUrl + ' ', e);

            return res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    });

    router.get('/v1/sales/suggestions', server.web.caching({expire: 60}), async (req, res) => {
        try {
            const args = filterQueryArgs(req, {
                limit: {type: 'int', min: 1, max: 100, default: 10},

                template_id: {type: 'int', min: 0},
                collection_name: {type: 'string', min: 1, max: 12},
                schema_name: {type: 'string', min: 1, max: 12},
                asset_id: {type: 'int', min: 1},

                sale_id: {type: 'int', min: 1}
            });

            if (args.sale_id) {
                const query = await core.connection.database.query(
                    'SELECT * FROM atomicmarket_sales_master WHERE market_contract = $1 AND sale_id = $2',
                    [core.args.atomicmarket_account, args.sale_id]
                );

                if (query.rowCount === 0) {
                    return res.status(416).json({success: false, message: 'Sale not found'});
                }

                const sale = await fillSales(core.connection, core.args.atomicassets_account, query.rows.map((row) => formatSale(row)));

                if (sale[0].assets[0].template) {
                    args.template_id = sale[0].assets[0].template.template_id;
                }

                args.collection_name = sale[0].assets[0].collection.collection_name;
                args.schema_name = sale[0].assets[0].schema.schema_name;
                args.asset_id = sale[0].assets[0].asset_id;
            }

            let sales: any[] = [];
            for (let i = 0; i <= 3 && sales.length === 0; i++) {
                const queryValues = [core.args.atomicmarket_account, args.sale_id ? args.sale_id : null];
                let queryString = 'SELECT * from atomicmarket_sales_master listing WHERE market_contract = $1 AND sale_id != $2 AND EXISTS (' +
                    'SELECT * FROM atomicassets_offers_assets asset_o, atomicassets_assets asset_a ' +
                    'WHERE listing.state = ' + SaleState.LISTED.valueOf() + ' AND listing.offer_state = ' + OfferState.PENDING.valueOf() + ' AND ' +
                    'asset_o.offer_id = listing.offer_id AND asset_o.contract = listing.assets_contract AND ' +
                    'asset_o.contract = asset_a.contract AND asset_o.asset_id = asset_a.asset_id ';

                if (args.template_id && i <= 0) {
                    queryValues.push(args.template_id);
                    queryString += 'AND asset_a.template_id = $' + queryValues.length + ' ';
                }

                if (args.schema_name && i <= 1) {
                    queryValues.push(args.schema_name);
                    queryString += 'AND asset_a.schema_name = $' + queryValues.length + ' ';
                }

                if (args.collection_name && i <= 2) {
                    queryValues.push(args.collection_name);
                    queryString += 'AND asset_a.collection_name = $' + queryValues.length + ' ';
                }

                queryValues.push(args.limit);
                queryString += ') ORDER BY raw_price ASC LIMIT $' + queryValues.length;

                logger.debug(queryString);

                const query = await core.connection.database.query(queryString, queryValues);

                sales = query.rows.map(row => formatSale(row));
            }

            res.json({
                success: true,
                data: await fillSales(core.connection, core.args.atomicassets_account, sales),
                query_time: Date.now()
            });
        } catch (e) {
            logger.error(req.originalUrl + ' ', e);

            return res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    });

    return {
        tag: {
            name: 'stats',
            description: 'Stats'
        },
        paths: {
            '/v1/stats': {
                get: {
                    tags: ['stats'],
                    summary: 'Get general atomicassets / atomicmarket stats',
                    parameters: [
                        {
                            in: 'query',
                            name: 'symbol',
                            required: false,
                            schema: {type: 'string'},
                            description: 'Token symbol'
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 500], {
                        type: 'object',
                        properties: {
                            total: {
                                type: 'object',
                                properties: {
                                    nfts: {type: 'integer'}
                                }
                            },
                            today: {
                                type: 'object',
                                properties: {
                                    transactions: {type: 'integer'},
                                    sales_count: {type: 'integer'},
                                    sales_volume: {type: 'number'}
                                }
                            }
                        }
                    })
                }
            },
            '/v1/sales/trending': {
                get: {
                    tags: ['stats'],
                    summary: 'Get currently trending asset sales',
                    parameters: [
                        {
                            in: 'query',
                            name: 'limit',
                            required: false,
                            schema: {type: 'integer'},
                            description: 'Size of the result'
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 500], {
                        type: 'array',
                        items: {'$ref': '#/components/schemas/Sale'}
                    })
                }
            },
            '/v1/assets/suggestions': {
                get: {
                    tags: ['stats'],
                    summary: 'Get suggestions for the input. More detailed if more info is provided',
                    parameters: [
                        {
                            in: 'query',
                            name: 'limit',
                            required: false,
                            schema: {type: 'integer'},
                            description: 'Size of the result'
                        },
                        {
                            in: 'query',
                            name: 'collection_name',
                            required: false,
                            schema: {type: 'string'},
                            description: 'Filter by collection'
                        },
                        {
                            in: 'query',
                            name: 'schema_name',
                            required: false,
                            schema: {type: 'string'},
                            description: 'Filter by schema'
                        },
                        {
                            in: 'query',
                            name: 'template_id',
                            required: false,
                            schema: {type: 'integer'},
                            description: 'Filter by template'
                        },
                        {
                            in: 'query',
                            name: 'asset_id',
                            required: false,
                            schema: {type: 'integer'},
                            description: 'Get suggestions for a specific asset'
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 500], {
                        type: 'array',
                        items: {'$ref': '#/components/schemas/ListingAsset'}
                    })
                }
            },
            '/v1/sales/suggestions': {
                get: {
                    tags: ['stats'],
                    summary: 'Get suggestions for the input. More detailed if more info is provided',
                    parameters: [
                        {
                            in: 'query',
                            name: 'limit',
                            required: false,
                            schema: {type: 'integer'},
                            description: 'Size of the result'
                        },
                        {
                            in: 'query',
                            name: 'collection_name',
                            required: false,
                            schema: {type: 'string'},
                            description: 'Filter by collection'
                        },
                        {
                            in: 'query',
                            name: 'schema_name',
                            required: false,
                            schema: {type: 'string'},
                            description: 'Filter by schema'
                        },
                        {
                            in: 'query',
                            name: 'template_id',
                            required: false,
                            schema: {type: 'integer'},
                            description: 'Filter by template'
                        },
                        {
                            in: 'query',
                            name: 'asset_id',
                            required: false,
                            schema: {type: 'integer'},
                            description: 'Get suggestions for a specific asset'
                        },
                        {
                            in: 'query',
                            name: 'sale_id',
                            required: false,
                            schema: {type: 'integer'},
                            description: 'Get suggestions for a sale id'
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 500], {
                        type: 'array',
                        items: {'$ref': '#/components/schemas/ListingAsset'}
                    })
                }
            }
        }
    };
}
