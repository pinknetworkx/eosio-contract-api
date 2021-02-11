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
import { buildGreylistFilter } from '../../atomicassets/utils';
import {
    applyActionGreylistFilters,
    createSocketApiNamespace,
    extractNotificationIdentifiers,
    getContractActionLogs
} from '../../../utils';
import ApiNotificationReceiver from '../../../notification';
import { NotificationData } from '../../../../filler/notifier';

export function salesEndpoints(core: AtomicMarketNamespace, server: HTTPServer, router: express.Router): any {
    router.all(['/v1/sales', '/v1/sales/_count'], server.web.caching(), async (req, res) => {
        try {
            const args = filterQueryArgs(req, {
                page: {type: 'int', min: 1, default: 1},
                limit: {type: 'int', min: 1, max: 100, default: 100},
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
                    LEFT JOIN atomicmarket_sale_stats stats ON (stats.market_contract = listing.market_contract AND stats.sale_id = listing.sale_id)
                WHERE listing.market_contract = $1 ` + filter.str;
            const queryValues = [core.args.atomicmarket_account, ...filter.values];
            let varCounter = queryValues.length;

            const blacklistFilter = buildGreylistFilter(req, varCounter, 'listing.collection_name');
            queryValues.push(...blacklistFilter.values);
            varCounter += blacklistFilter.values.length;
            queryString += blacklistFilter.str;

            const boundaryFilter = buildBoundaryFilter(
                req, varCounter, 'listing.sale_id', 'int',
                args.sort === 'updated' ? 'listing.updated_at_time' : 'listing.created_at_time',
                args.sort === 'updated' ? 'listing.updated_at_block' : 'listing.created_at_block'
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

            const sortColumnMapping = {
                sale_id: 'listing.sale_id',
                created: 'listing.created_at_block',
                updated: 'listing.updated_at_block',
                price: 'price.price',
                template_mint: 'mint.min_template_mint',
                schema_mint: 'mint.min_schema_mint',
                collection_mint: 'mint.min_collection_mint'
            };

            // @ts-ignore
            queryString += 'ORDER BY ' + sortColumnMapping[args.sort] + ' ' + args.order + ' NULLS LAST, listing.sale_id ASC ';
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
        const sales = query.rows.map((row: any) => formatSale(row));

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
