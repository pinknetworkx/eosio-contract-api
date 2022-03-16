import * as express from 'express';

import { AtomicMarketNamespace, AuctionApiState } from '../index';
import { HTTPServer } from '../../../server';
import { formatAuction } from '../format';
import { fillAuctions } from '../filler';
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
import { eosioTimestampToDate } from '../../../../utils/eosio';
import { getAuctionAction, getAuctionLogsAction, getAuctionsAction, getAuctionsCountAction } from '../handlers/auctions';

export function auctionsEndpoints(core: AtomicMarketNamespace, server: HTTPServer, router: express.Router): any {
    const {caching, returnAsJSON} = server.web;

    router.all('/v1/auctions', caching(), returnAsJSON(getAuctionsAction, core));
    router.all('/v1/auctions/_count', caching(), returnAsJSON(getAuctionsCountAction, core));

    router.all('/v1/auctions/:auction_id', caching(), returnAsJSON(getAuctionAction, core));

    router.all('/v1/auctions/:auction_id/logs', caching(), returnAsJSON(getAuctionLogsAction, core));

    return {
        tag: {
            name: 'auctions',
            description: 'Auctions'
        },
        paths: {
            '/v1/auctions': {
                get: {
                    tags: ['auctions'],
                    summary: 'Get all auctions.',
                    description: atomicDataFilter,
                    parameters: [
                        {
                            name: 'state',
                            in: 'query',
                            description: 'Filter by auction state (' +
                                AuctionApiState.WAITING.valueOf() + ': WAITING: Auction created but assets were not transferred yet, ' +
                                AuctionApiState.LISTED.valueOf() + ': LISTED - Auction pending and open to bids, ' +
                                AuctionApiState.CANCELED.valueOf() + ': CANCELED - Auction was canceled, ' +
                                AuctionApiState.SOLD.valueOf() + ': SOLD - Auction has been sold, ' +
                                AuctionApiState.INVALID.valueOf() + ': INVALID - Auction ended but no bid was made' +
                                ') - separate multiple with ","',
                            required: false,
                            schema: {type: 'string'}
                        },
                        {
                            name: 'bidder',
                            in: 'query',
                            description: 'Filter by auctions with this bidder',
                            required: false,
                            schema: {type: 'string'}
                        },
                        {
                            name: 'participant',
                            in: 'query',
                            description: 'Filter by auctions where this account participated and can still claim / bid',
                            required: false,
                            schema: {type: 'string'}
                        },
                        {
                            name: 'hide_empty_auctions',
                            in: 'query',
                            description: 'Hide auctions with no bids',
                            required: false,
                            schema: {type: 'boolean'}
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
                                    'created', 'updated', 'ending', 'auction_id', 'price',
                                    'template_mint'
                                ],
                                default: 'created'
                            }
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 500], {
                        type: 'array',
                        items: {'$ref': '#/components/schemas/Auction'}
                    })
                }
            },
            '/v1/auctions/{auction_id}': {
                get: {
                    tags: ['auctions'],
                    summary: 'Get a specific auction by id',
                    parameters: [
                        {
                            in: 'path',
                            name: 'auction_id',
                            description: 'Auction Id',
                            required: true,
                            schema: {type: 'integer'}
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 416, 500], {'$ref': '#/components/schemas/Auction'})
                }
            },
            '/v1/auctions/{auction_id}/logs': {
                get: {
                    tags: ['auctions'],
                    summary: 'Fetch auction logs',
                    parameters: [
                        {
                            name: 'auction_id',
                            in: 'path',
                            description: 'ID of auction',
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

export function auctionSockets(core: AtomicMarketNamespace, server: HTTPServer, notification: ApiNotificationReceiver): void {
    const namespace = createSocketApiNamespace(server, core.path + '/v1/auctions');

    namespace.on('connection', (socket) => {
        socket.on('subscribe', data => {
            const availableRooms = ['new_auctions', 'new_bids'];

            for (const room of availableRooms) {
                if (data && data[room]) {
                    socket.join(room);
                } else if (socket.rooms.has(room)) {
                    socket.leave(room);
                }
            }
        });
    });

    notification.onData('auctions', async (notifications: NotificationData[]) => {
        const auctionIDs = extractNotificationIdentifiers(notifications, 'auction_id');
        const query = await server.database.query(
            'SELECT * FROM atomicmarket_auctions_master WHERE market_contract = $1 AND auction_id = ANY($2)',
            [core.args.atomicmarket_account, auctionIDs]
        );

        const auctions = await fillAuctions(server, core.args.atomicassets_account, query.rows.map((row: any) => formatAuction(row)));

        for (const notification of notifications) {
            if (notification.type === 'trace' && notification.data.trace) {
                const trace = notification.data.trace;

                if (trace.act.account !== core.args.atomicmarket_account) {
                    continue;
                }

                const auctionID = (<any>trace.act.data).auction_id;
                const auction = auctions.find(row => String(row.auction_id) === String(auctionID));

                if (trace.act.name === 'lognewauct') {
                    namespace.in('new_auctions').emit('new_auction', {
                        transaction: notification.data.tx,
                        block: notification.data.block,
                        trace: notification.data.trace,
                        auction_id: auctionID,
                        auction: auction
                    });
                } else if (trace.act.name === 'auctionbid') {
                    const amount = (<any>trace.act.data).bid.split(' ')[0].replace('.', '');
                    const bid = auction.bids.find((bid: any) => String(bid.amount) === String(amount));

                    namespace.in('new_bids').emit('new_bid', {
                        transaction: notification.data.tx,
                        block: notification.data.block,
                        trace: notification.data.trace,
                        auction_id: auctionID,
                        bid: auction ? {
                            number: bid ? bid.number : 0,
                            account: (<any>trace.act.data).bidder,
                            amount: amount,
                            created_at_block: notification.data.block.block_num,
                            created_at_time: eosioTimestampToDate(notification.data.block.timestamp).getTime(),
                            txid: notification.data.tx.id
                        } : null,
                        auction: auction
                    });
                }
            } else if (notification.type === 'fork') {
                namespace.emit('fork', {block_num: notification.data.block.block_num});
            }
        }
    });
}
