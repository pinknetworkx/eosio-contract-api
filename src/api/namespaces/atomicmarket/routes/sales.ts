import * as express from 'express';

import { AtomicMarketNamespace, SaleApiState } from '../index';
import { HTTPServer } from '../../../server';
import { fillSales } from '../filler';
import { formatSale } from '../format';
import { extendedAssetFilterParameters, atomicDataFilter, baseAssetFilterParameters } from '../../atomicassets/openapi';
import {
    actionGreylistParameters,
    dateBoundaryParameters,
    getOpenAPI3Responses,
    paginationParameters,
    primaryBoundaryParameters
} from '../../../docs';
import { listingFilterParameters } from '../openapi';
import {
    createSocketApiNamespace,
    extractNotificationIdentifiers,
} from '../../../utils';
import ApiNotificationReceiver from '../../../notification';
import { NotificationData } from '../../../../filler/notifier';
import {
    getSaleAction,
    getSaleLogsAction,
    getSalesAction, getSalesCountAction, getSalesTemplatesAction
} from '../handlers/sales';
import { getSalesCountV2Action, getSalesV2Action } from '../handlers/sales2';

export function salesEndpoints(core: AtomicMarketNamespace, server: HTTPServer, router: express.Router): any {
    const {caching, returnAsJSON} = server.web;

    router.all('/v0/sales', caching(), returnAsJSON(getSalesAction, core));
    router.all('/v0/sales/_count', caching(), returnAsJSON(getSalesCountAction, core));

    if (core.args.api_features?.disable_v1_sales) {
        router.all('/v1/sales', caching(), returnAsJSON(getSalesV2Action, core));
        router.all('/v1/sales/_count', caching(), returnAsJSON(getSalesCountV2Action, core));
    } else {
        router.all('/v1/sales', caching(), returnAsJSON(getSalesAction, core));
        router.all('/v1/sales/_count', caching(), returnAsJSON(getSalesCountAction, core));
    }

    router.all('/v2/sales', caching(), returnAsJSON(getSalesV2Action, core));
    router.all('/v2/sales/_count', caching(), returnAsJSON(getSalesCountV2Action, core));

    router.all('/v1/sales/templates', caching(), returnAsJSON(getSalesTemplatesAction, core));

    router.all('/v1/sales/:sale_id', caching(), returnAsJSON(getSaleAction, core));

    router.all('/v1/sales/:sale_id/logs', caching(), returnAsJSON(getSaleLogsAction, core));

    return {
        tag: {
            name: 'sales',
            description: 'Sales'
        },
        paths: {
            '/v2/sales': {
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
                        ...baseAssetFilterParameters,
                        ...extendedAssetFilterParameters,
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
                                    'template_mint'
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
                        ...baseAssetFilterParameters,
                        ...extendedAssetFilterParameters,
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

    namespace.on('connection', (socket) => {
        socket.on('subscribe', data => {
            const availableRooms = ['new_sales', 'purchased_sales'];

            for (const room of availableRooms) {
                if (data && data[room]) {
                    socket.join(room);
                } else if (socket.rooms.has(room)) {
                    socket.leave(room);
                }
            }
        });
    });

    notification.onData('sales', async (notifications: NotificationData[]) => {
        const saleIDs = extractNotificationIdentifiers(notifications, 'sale_id');
        const query = await server.database.query(
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
                    namespace.in('new_sales').emit('new_sale', {
                        transaction: notification.data.tx,
                        block: notification.data.block,
                        trace: trace,
                        sale_id: saleID,
                        sale: sales.find((row: any) => String(row.sale_id) === String(saleID))
                    });
                } else if (trace.act.name === 'purchasesale') {
                    namespace.in('purchased_sales').emit('purchased_sale', {
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
