import * as express from 'express';

import { AtomicMarketNamespace, BuyofferApiState } from '../index';
import { HTTPServer } from '../../../server';
import { formatBuyoffer } from '../format';
import { fillBuyoffers } from '../filler';
import {
    actionGreylistParameters,
    dateBoundaryParameters,
    getOpenAPI3Responses,
    paginationParameters,
    primaryBoundaryParameters
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
    getBuyOfferAction,
    getBuyOfferLogsAction,
    getBuyOffersAction,
    getBuyOffersCountAction
} from '../handlers/buyoffers';

export function buyoffersEndpoints(core: AtomicMarketNamespace, server: HTTPServer, router: express.Router): any {
    const {caching, returnAsJSON} = server.web;

    router.all('/v1/buyoffers', caching(), returnAsJSON(getBuyOffersAction, core));
    router.all('/v1/buyoffers/_count', caching(), returnAsJSON(getBuyOffersCountAction, core));

    router.all('/v1/buyoffers/:buyoffer_id', caching(), returnAsJSON(getBuyOfferAction, core));

    router.all('/v1/buyoffers/:buyoffer_id/logs', caching(), returnAsJSON(getBuyOfferLogsAction, core));

    return {
        tag: {
            name: 'buyoffers',
            description: 'Buyoffers'
        },
        paths: {
            '/v1/buyoffers': {
                get: {
                    tags: ['buyoffers'],
                    summary: 'Get all buyoffers.',
                    description: atomicDataFilter,
                    parameters: [
                        {
                            name: 'state',
                            in: 'query',
                            description: 'Filter by buyoffer state (' +
                                BuyofferApiState.PENDING.valueOf() + ': WAITING: Buyoffer created and pending, ' +
                                BuyofferApiState.DECLINED.valueOf() + ': LISTED - Buyoffer was declined, ' +
                                BuyofferApiState.CANCELED.valueOf() + ': CANCELED - Buyoffer was canceled, ' +
                                BuyofferApiState.ACCEPTED.valueOf() + ': SOLD - Buyoffer has been sold, ' +
                                BuyofferApiState.INVALID.valueOf() + ': INVALID - Buyoffer invalid because recipient does not own all assets anymore' +
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
                                    'created', 'updated', 'buyoffer_id', 'price',
                                    'template_mint'
                                ],
                                default: 'created'
                            }
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 500], {
                        type: 'array',
                        items: {'$ref': '#/components/schemas/Buyoffer'}
                    })
                }
            },
            '/v1/buyoffers/{buyoffer_id}': {
                get: {
                    tags: ['buyoffers'],
                    summary: 'Get a specific buyoffer by id',
                    parameters: [
                        {
                            in: 'path',
                            name: 'buyoffer_id',
                            description: 'Buyoffer Id',
                            required: true,
                            schema: {type: 'integer'}
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 416, 500], {'$ref': '#/components/schemas/Buyoffer'})
                }
            },
            '/v1/buyoffers/{buyoffer_id}/logs': {
                get: {
                    tags: ['buyoffers'],
                    summary: 'Fetch buyoffer logs',
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

export function buyofferSockets(core: AtomicMarketNamespace, server: HTTPServer, notification: ApiNotificationReceiver): void {
    const namespace = createSocketApiNamespace(server, core.path + '/v1/buyoffers');

    namespace.on('connection', (socket) => {
        socket.on('subscribe', data => {
            const availableRooms = ['new_buyoffers'];

            for (const room of availableRooms) {
                if (data && data[room]) {
                    socket.join(room);
                } else if (socket.rooms.has(room)) {
                    socket.leave(room);
                }
            }
        });
    });

    notification.onData('buyoffers', async (notifications: NotificationData[]) => {
        const buyofferIDs = extractNotificationIdentifiers(notifications, 'buyoffer_id');
        const query = await server.database.query(
            'SELECT * FROM atomicmarket_buyoffers_master WHERE market_contract = $1 AND buyoffer_id = ANY($2)',
            [core.args.atomicmarket_account, buyofferIDs]
        );

        const buyoffers = await fillBuyoffers(server, core.args.atomicassets_account, query.rows);

        for (const notification of notifications) {
            if (notification.type === 'trace' && notification.data.trace) {
                const trace = notification.data.trace;

                if (trace.act.account !== core.args.atomicmarket_account) {
                    continue;
                }

                const buyofferID = (<any>trace.act.data).buyoffer_id;
                const buyoffer = buyoffers.find(row => String(row.buyoffer_id) === String(buyofferID));

                if (trace.act.name === 'lognewbuyo') {
                    namespace.in('new_buyoffers').emit('new_buyoffer', {
                        transaction: notification.data.tx,
                        block: notification.data.block,
                        trace: notification.data.trace,
                        buyoffer_id: buyofferID,
                        buyoffer: formatBuyoffer(buyoffer)
                    });
                }
            } else if (notification.type === 'fork') {
                namespace.emit('fork', {block_num: notification.data.block.block_num});
            }
        }
    });
}
