import * as express from 'express';

import { AtomicMarketNamespace, SaleApiState } from '../index';
import { HTTPServer } from '../../../server';
import { buildSaleFilter } from '../utils';
import { fillSales } from '../filler';
import { formatSale } from '../format';
import { assetFilterParameters, atomicDataFilter } from '../../atomicassets/openapi';
import {
    actionGreylistParameters,
    dateBoundaryParameters,
    getOpenAPI3Responses,
    paginationParameters,
    primaryBoundaryParameters
} from '../../../docs';
import logger from '../../../../utils/winston';
import { buildBoundaryFilter, filterQueryArgs } from '../../utils';
import { listingFilterParameters } from '../openapi';
import { buildAssetFilter, buildGreylistFilter } from '../../atomicassets/utils';
import {
    applyActionGreylistFilters,
    createSocketApiNamespace,
    extractNotificationIdentifiers,
    getContractActionLogs
} from '../../../utils';
import ApiNotificationReceiver from '../../../notification';
import { NotificationData } from '../../../../filler/notifier';
import { OfferState } from '../../../../filler/handlers/atomicassets';
import { SaleState } from '../../../../filler/handlers/atomicmarket';

export function salesEndpoints(core: AtomicMarketNamespace, server: HTTPServer, router: express.Router): any {
    router.all(['/v1/sales', '/v1/sales/_count'], server.web.caching(), async (req, res) => {
        try {
            const args = filterQueryArgs(req, {
                page: {type: 'int', min: 1, default: 1},
                limit: {type: 'int', min: 1, max: 100, default: 100},
                collection_name: {type: 'string', min: 1},
                sort: {
                    type: 'string',
                    values: [
                        'created', 'updated', 'sale_id', 'price',
                        'template_mint', 'schema_mint', 'collection_mint'
                    ],
                    default: 'created'
                },
                order: {type: 'string', values: ['asc', 'desc'], default: 'desc'}
            });

            const filter = buildSaleFilter(req, 1);

            let queryString = `
                SELECT listing.sale_id 
                FROM atomicmarket_sales listing 
                    JOIN atomicassets_offers offer ON (listing.assets_contract = offer.contract AND listing.offer_id = offer.offer_id)
                    LEFT JOIN atomicmarket_sale_prices price ON (price.market_contract = listing.market_contract AND price.sale_id = listing.sale_id)
                    LEFT JOIN atomicmarket_sale_mints mint ON (mint.market_contract = listing.market_contract AND mint.sale_id = listing.sale_id)
                WHERE listing.market_contract = $1 ` + filter.str;
            const queryValues = [core.args.atomicmarket_account, ...filter.values];
            let varCounter = queryValues.length;

            if (!args.collection_name) {
                const blacklistFilter = buildGreylistFilter(req, varCounter, 'listing.collection_name');
                queryValues.push(...blacklistFilter.values);
                varCounter += blacklistFilter.values.length;
                queryString += blacklistFilter.str;
            }

            const boundaryFilter = buildBoundaryFilter(
                req, varCounter, 'listing.sale_id', 'int',
                args.sort === 'updated' ? 'listing.updated_at_time' : 'listing.created_at_time'
            );
            queryValues.push(...boundaryFilter.values);
            varCounter += boundaryFilter.values.length;
            queryString += boundaryFilter.str;

            if (req.originalUrl.search('/_count') >= 0) {
                const countQuery = await server.query(
                    'SELECT COUNT(*) counter FROM (' + queryString + ') x',
                    queryValues
                );

                return res.json({success: true, data: countQuery.rows[0].counter, query_time: Date.now()});
            }

            const sortMapping: {[key: string]: {column: string, nullable: boolean}}  = {
                sale_id: {column: 'listing.sale_id', nullable: false},
                created: {column: 'listing.created_at_time', nullable: false},
                updated: {column: 'listing.updated_at_time', nullable: false},
                price: {column: 'price.price', nullable: true},
                template_mint: {column: 'mint.min_template_mint', nullable: true},
                schema_mint: {column: 'mint.min_schema_mint', nullable: true},
                collection_mint: {column: 'mint.min_collection_mint', nullable: true}
            };

            queryString += 'ORDER BY ' + sortMapping[args.sort].column + ' ' + args.order + ' ' + (sortMapping[args.sort].nullable ? 'NULLS LAST' : '') + ', listing.sale_id ASC ';
            queryString += 'LIMIT $' + ++varCounter + ' OFFSET $' + ++varCounter + ' ';
            queryValues.push(args.limit);
            queryValues.push((args.page - 1) * args.limit);

            const saleQuery = await server.query(queryString, queryValues);

            const saleLookup: {[key: string]: any} = {};
            const query = await server.query(
                'SELECT * FROM atomicmarket_sales_master WHERE market_contract = $1 AND sale_id = ANY ($2)',
                [core.args.atomicmarket_account, saleQuery.rows.map(row => row.sale_id)]
            );

            query.rows.reduce((prev, current) => {
                prev[String(current.sale_id)] = current;

                return prev;
            }, saleLookup);

            const sales = await fillSales(
                server, core.args.atomicassets_account, saleQuery.rows.map((row) => formatSale(saleLookup[String(row.sale_id)]))
            );

            res.json({success: true, data: sales, query_time: Date.now()});
        } catch (e) {
            res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    });

    router.all(['/v1/sales/templates'], server.web.caching(), async (req, res) => {
        try {
            const args = filterQueryArgs(req, {
                symbol: {type: 'string', min: 1},
                collection_name: {type: 'string', min: 1},
                collection_whitelist: {type: 'string', min: 1},

                min_price: {type: 'float', min: 0},
                max_price: {type: 'float', min: 0},

                page: {type: 'int', min: 1, default: 1},
                limit: {type: 'int', min: 1, max: 100, default: 100},
                sort: {
                    type: 'string',
                    values: ['template_id', 'price'],
                    default: 'template_id'
                },
                order: {type: 'string', values: ['asc', 'desc'], default: 'desc'},
            });

            if (!args.symbol) {
                return res.json({success: false, message: 'symbol parameter is required'});
            }

            if (!args.collection_name && !args.collection_whitelist) {
                return res.json({success: false, message: 'You need to specify a collection name'});
            }

            let queryString = `
            SELECT * FROM (
                SELECT DISTINCT ON(asset.contract, asset.template_id) 
                    sale.market_contract, sale.sale_id, asset.contract assets_contract, asset.template_id, price.price
                FROM 
                    atomicmarket_sales sale, atomicassets_offers offer, atomicassets_offers_assets offer_asset, 
                    atomicassets_assets asset, atomicmarket_sale_prices price
                WHERE sale.assets_contract = offer.contract AND sale.offer_id = offer.offer_id AND
                    offer.contract = offer_asset.contract AND offer.offer_id = offer_asset.offer_id AND
                    offer_asset.contract = asset.contract AND offer_asset.asset_id = asset.asset_id AND
                    sale.market_contract = price.market_contract AND sale.sale_id = price.sale_id AND 
                    asset.template_id IS NOT NULL AND offer_asset.index = 1 AND
                    offer.state = ${OfferState.PENDING.valueOf()} AND sale.state = ${SaleState.LISTED.valueOf()} AND 
                    sale.market_contract = $1 AND sale.settlement_symbol = $2
                `;
            const queryValues = [core.args.atomicmarket_account, args.symbol];
            let varCounter = queryValues.length;

            const blacklistFilter = buildGreylistFilter(req, varCounter, 'sale.collection_name');
            queryValues.push(...blacklistFilter.values);
            varCounter += blacklistFilter.values.length;
            queryString += blacklistFilter.str;

            const filter = buildAssetFilter(req, varCounter, {assetTable: '"asset"'});
            queryValues.push(...filter.values);
            varCounter += filter.values.length;
            queryString += filter.str;

            if (args.min_price) {
                queryString += 'AND price.price >= $' + ++varCounter + ' * POW(10, price.settlement_precision) ';
                queryValues.push(args.min_price);
            }

            if (args.max_price) {
                queryString += 'AND price.price <= $' + ++varCounter + ' * POW(10, price.settlement_precision) ';
                queryValues.push(args.min_price);
            }

            if (args.collection_name) {
                queryString += 'AND sale.collection_name = ANY($' + ++varCounter + ') ';
                queryValues.push(args.collection_name.split(','));
            }

            queryString += 'ORDER BY asset.contract, asset.template_id, price.price ASC) t1 ';

            const sortColumnMapping = {
                price: 't1.price',
                template_id: 't1.template_id',
            };

            // @ts-ignore
            queryString += 'ORDER BY ' + sortColumnMapping[args.sort] + ' ' + args.order + ' NULLS LAST, t1.template_id ASC ';
            queryString += 'LIMIT $' + ++varCounter + ' OFFSET $' + ++varCounter + ' ';
            queryValues.push(args.limit);
            queryValues.push((args.page - 1) * args.limit);

            const saleQuery = await server.query(queryString, queryValues);

            const saleLookup: {[key: string]: any} = {};
            const query = await server.query(
                'SELECT * FROM atomicmarket_sales_master WHERE market_contract = $1 AND sale_id = ANY ($2)',
                [core.args.atomicmarket_account, saleQuery.rows.map(row => row.sale_id)]
            );

            query.rows.reduce((prev, current) => {
                prev[String(current.sale_id)] = current;

                return prev;
            }, saleLookup);

            const sales = await fillSales(
                server, core.args.atomicassets_account, saleQuery.rows.map((row) => formatSale(saleLookup[String(row.sale_id)]))
            );

            res.json({success: true, data: sales, query_time: Date.now()});
        } catch (e) {
            res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    });

    router.all('/v1/sales/:sale_id', server.web.caching(), async (req, res) => {
        try {
            const query = await server.query(
                'SELECT * FROM atomicmarket_sales_master WHERE market_contract = $1 AND sale_id = $2',
                [core.args.atomicmarket_account, req.params.sale_id]
            );

            if (query.rowCount === 0) {
                res.status(416).json({success: false, message: 'Sale not found'});
            } else {
                const sales = await fillSales(
                    server, core.args.atomicassets_account, query.rows.map((row) => formatSale(row))
                );

                res.json({success: true, data: sales[0], query_time: Date.now()});
            }
        } catch (e) {
            res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    });

    router.all('/v1/sales/:sale_id/logs', server.web.caching(), (async (req, res) => {
        const args = filterQueryArgs(req, {
            page: {type: 'int', min: 1, default: 1},
            limit: {type: 'int', min: 1, max: 100, default: 100},
            order: {type: 'string', values: ['asc', 'desc'], default: 'asc'}
        });

        try {
            res.json({
                success: true,
                data: await getContractActionLogs(
                    server, core.args.atomicmarket_account,
                    applyActionGreylistFilters(['lognewsale', 'logsalestart', 'cancelsale', 'purchasesale'], args),
                    {sale_id: req.params.sale_id},
                    (args.page - 1) * args.limit, args.limit, args.order
                ), query_time: Date.now()
            });
        } catch (e) {
            logger.error(e);

            return res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    }));

    return {
        tag: {
            name: 'sales',
            description: 'Sales'
        },
        paths: {
            '/v1/sales': {
                get: {
                    tags: ['sales'],
                    summary: 'Get all sales. ',
                    description: atomicDataFilter,
                    parameters: [
                        {
                            name: 'state',
                            in: 'query',
                            description: 'Filter by sale state (' +
                                SaleApiState.WAITING.valueOf() + ': WAITING - Sale created but offer was not send yet, ' +
                                SaleApiState.LISTED.valueOf() + ': LISTED - Assets for sale, ' +
                                SaleApiState.CANCELED.valueOf() + ': CANCELED - Sale was canceled, ' +
                                SaleApiState.SOLD.valueOf() + ': SOLD - Sale was bought' +
                                SaleApiState.INVALID.valueOf() + ': INVALID - Sale is still listed but offer is currently invalid (can become valid again if the user owns all assets again)' +
                                ') - separate multiple with ","',
                            required: false,
                            schema: {type: 'string'}
                        },
                        ...listingFilterParameters,
                        ...assetFilterParameters,
                        ...primaryBoundaryParameters,
                        ...dateBoundaryParameters,
                        ...paginationParameters,
                        {
                            name: 'sort',
                            in: 'query',
                            description: 'Column to sort',
                            required: false,
                            schema: {
                                type: 'string',
                                enum: [
                                    'created', 'updated', 'sale_id', 'price',
                                    'template_mint', 'schema_mint', 'collection_mint'
                                ],
                                default: 'created'
                            }
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 500], {
                        type: 'array',
                        items: {'$ref': '#/components/schemas/Sale'}
                    })
                }
            },
            '/v1/sales/templates': {
                get: {
                    tags: ['sales'],
                    summary: 'Get the cheapest sale grouped by templates. ',
                    description: atomicDataFilter,
                    parameters: [
                        {
                            name: 'symbol',
                            in: 'query',
                            description: 'Token symbol',
                            required: true,
                            schema: {type: 'string'}
                        },
                        {
                            name: 'min_price',
                            in: 'query',
                            description: 'Min price',
                            required: false,
                            schema: {type: 'number'}
                        },
                        {
                            name: 'max_price',
                            in: 'query',
                            description: 'Max price',
                            required: false,
                            schema: {type: 'number'}
                        },
                        ...assetFilterParameters,
                        ...primaryBoundaryParameters,
                        ...paginationParameters,
                        {
                            name: 'sort',
                            in: 'query',
                            description: 'Column to sort',
                            required: false,
                            schema: {
                                type: 'string',
                                enum: ['template_id', 'price'],
                                default: 'created'
                            }
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 500], {
                        type: 'array',
                        items: {'$ref': '#/components/schemas/Sale'}
                    })
                }
            },
            '/v1/sales/{sale_id}': {
                get: {
                    tags: ['sales'],
                    summary: 'Get a specific sale by id',
                    parameters: [
                        {
                            in: 'path',
                            name: 'sale_id',
                            description: 'Sale Id',
                            required: true,
                            schema: {type: 'integer'}
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 416, 500], {'$ref': '#/components/schemas/Sale'})
                }
            },
            '/v1/sales/{sale_id}/logs': {
                get: {
                    tags: ['sales'],
                    summary: 'Fetch sale logs',
                    parameters: [
                        {
                            name: 'sale_id',
                            in: 'path',
                            description: 'ID of sale',
                            required: true,
                            schema: {type: 'integer'}
                        },
                        ...paginationParameters,
                        ...actionGreylistParameters
                    ],
                    responses: getOpenAPI3Responses([200, 500], {type: 'array', items: {'$ref': '#/components/schemas/Log'}})
                }
            }
        }
    };
}

export function salesSockets(core: AtomicMarketNamespace, server: HTTPServer, notification: ApiNotificationReceiver): void {
    const namespace = createSocketApiNamespace(server, core.path + '/v1/sales');

    notification.onData('sales', async (notifications: NotificationData[]) => {
        const saleIDs = extractNotificationIdentifiers(notifications, 'sale_id');
        const query = await server.query(
            'SELECT * FROM atomicmarket_sales_master WHERE market_contract = $1 AND sale_id = ANY($2)',
            [core.args.atomicmarket_account, saleIDs]
        );

        const sales = await fillSales(server, core.args.atomicassets_account, query.rows.map((row: any) => formatSale(row)));

        for (const notification of notifications) {
            if (notification.type === 'trace' && notification.data.trace) {
                const trace = notification.data.trace;

                if (trace.act.account !== core.args.atomicmarket_account) {
                    continue;
                }

                const saleID = (<any>trace.act.data).sale_id;

                if (trace.act.name === 'lognewsale') {
                    namespace.emit('new_sale', {
                        transaction: notification.data.tx,
                        block: notification.data.block,
                        trace: trace,
                        sale_id: saleID,
                        sale: sales.find((row: any) => String(row.sale_id) === String(saleID))
                    });
                }
            } else if (notification.type === 'fork') {
                namespace.emit('fork', {block_num: notification.data.block.block_num});
            }
        }
    });
}
