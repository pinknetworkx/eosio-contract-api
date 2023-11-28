import * as express from 'express';

import { AtomicMarketNamespace, TemplateBuyofferApiState } from '../index';
import { HTTPServer } from '../../../server';
import { formatTemplateBuyoffer } from '../format';
import { fillTemplateBuyoffers } from '../filler';
import {
    actionGreylistParameters,
    dateBoundaryParameters,
    getOpenAPI3Responses,
    getPrimaryBoundaryParams,
    paginationParameters,
} from '../../../docs';
import { extendedAssetFilterParameters, atomicDataFilter, baseAssetFilterParameters } from '../../atomicassets/openapi';
import { listingFilterParameters } from '../openapi';
import {
    createSocketApiNamespace,
    extractNotificationIdentifiers,
} from '../../../utils';
import ApiNotificationReceiver from '../../../notification';
import { NotificationData } from '../../../../filler/notifier';
import {
    getTemplateBuyOfferAction,
    getTemplateBuyOfferLogsAction,
    getTemplateBuyOffersAction,
    getTemplateBuyOffersCountAction
} from '../handlers/template-buyoffers';

export function templateBuyoffersEndpoints(core: AtomicMarketNamespace, server: HTTPServer, router: express.Router): any {
    const {caching, returnAsJSON} = server.web;

    router.all('/v1/template_buyoffers', caching(), returnAsJSON(getTemplateBuyOffersAction, core));
    router.all('/v1/template_buyoffers/_count', caching(), returnAsJSON(getTemplateBuyOffersCountAction, core));

    router.all('/v1/template_buyoffers/:buyoffer_id', caching(), returnAsJSON(getTemplateBuyOfferAction, core));

    router.all('/v1/template_buyoffers/:buyoffer_id/logs', caching(), returnAsJSON(getTemplateBuyOfferLogsAction, core));

    return {
        tag: {
            name: 'template_buyoffers',
            description: 'Template buyoffers'
        },
        paths: {
            '/v1/template_buyoffers': {
                get: {
                    tags: ['template_buyoffers'],
                    summary: 'Get all template buyoffers.',
                    description: atomicDataFilter,
                    parameters: [
                        {
                            name: 'state',
                            in: 'query',
                            description: 'Filter by buyoffer state (' +
                                TemplateBuyofferApiState.LISTED.valueOf() + ': LISTED - Buyoffer is listed, ' +
                                TemplateBuyofferApiState.CANCELED.valueOf() + ': CANCELED - Buyoffer was canceled, ' +
                                TemplateBuyofferApiState.SOLD.valueOf() + ': SOLD - Buyoffer has been sold, ' +
                                ') - separate multiple with ","',
                            required: false,
                            schema: {type: 'string'}
                        },
                        ...listingFilterParameters,
                        ...baseAssetFilterParameters,
                        ...extendedAssetFilterParameters,
                        ...getPrimaryBoundaryParams('buyoffer_id'),
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
                                    'created', 'updated', 'buyoffer_id', 'price',
                                    'template_mint', 'name',
                                ],
                                default: 'created'
                            }
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 500], {
                        type: 'array',
                        items: {'$ref': '#/components/schemas/TemplateBuyoffer'}
                    })
                }
            },
            '/v1/template_buyoffers/{buyoffer_id}': {
                get: {
                    tags: ['template_buyoffers'],
                    summary: 'Get a specific template buyoffer by id',
                    parameters: [
                        {
                            in: 'path',
                            name: 'buyoffer_id',
                            description: 'Buyoffer Id',
                            required: true,
                            schema: {type: 'integer'}
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 416, 500], {'$ref': '#/components/schemas/TemplateBuyoffer'})
                }
            },
            '/v1/template_buyoffers/{buyoffer_id}/logs': {
                get: {
                    tags: ['template_buyoffers'],
                    summary: 'Fetch template buyoffer logs',
                    parameters: [
                        {
                            name: 'buyoffer_id',
                            in: 'path',
                            description: 'ID of buyoffer',
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

export function templateBuyofferSockets(core: AtomicMarketNamespace, server: HTTPServer, notification: ApiNotificationReceiver): void {
    const namespace = createSocketApiNamespace(server, core.path + '/v1/template_buyoffers');

    namespace.on('connection', (socket) => {
        socket.on('subscribe', data => {
            const availableRooms = ['new_template_buyoffers'];

            for (const room of availableRooms) {
                if (data && data[room]) {
                    socket.join(room);
                } else if (socket.rooms.has(room)) {
                    socket.leave(room);
                }
            }
        });
    });

    notification.onData('template_buyoffers', async (notifications: NotificationData[]) => {
        const buyofferIDs = extractNotificationIdentifiers(notifications, 'buyoffer_id');
        const query = await server.database.query(
            'SELECT * FROM atomicmarket_template_buyoffers_master WHERE market_contract = $1 AND buyoffer_id = ANY($2)',
            [core.args.atomicmarket_account, buyofferIDs]
        );

        const buyoffers = await fillTemplateBuyoffers(server, core.args.atomicassets_account, query.rows);

        for (const notification of notifications) {
            if (notification.type === 'trace' && notification.data.trace) {
                const trace = notification.data.trace;

                if (trace.act.account !== core.args.atomicmarket_account) {
                    continue;
                }

                const buyofferID = (<any>trace.act.data).buyoffer_id;
                const buyoffer = buyoffers.find(row => String(row.buyoffer_id) === String(buyofferID));

                if (trace.act.name === 'lognewtbuyo') {
                    namespace.in('new_template_buyoffers').emit('new_template_buyoffer', {
                        transaction: notification.data.tx,
                        block: notification.data.block,
                        trace: notification.data.trace,
                        buyoffer_id: buyofferID,
                        buyoffer: formatTemplateBuyoffer(buyoffer)
                    });
                }
            } else if (notification.type === 'fork') {
                namespace.emit('fork', {block_num: notification.data.block.block_num});
            }
        }
    });
}
