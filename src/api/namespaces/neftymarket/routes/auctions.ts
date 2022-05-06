import * as express from 'express';

import {NeftyMarketNamespace, AuctionApiState, AuctionType} from '../index';
import { HTTPServer } from '../../../server';
import {
    actionGreylistParameters,
    dateBoundaryParameters,
    getOpenAPI3Responses,
    paginationParameters,
    primaryBoundaryParameters
} from '../../../docs';
import { extendedAssetFilterParameters, atomicDataFilter, baseAssetFilterParameters } from '../../atomicassets/openapi';
import { listingFilterParameters } from '../openapi';
import { getAuctionAction, getAuctionLogsAction, getAuctionsAction, getAuctionsCountAction } from '../handlers/auctions';

export function auctionsEndpoints(core: NeftyMarketNamespace, server: HTTPServer, router: express.Router): any {
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
                                AuctionApiState.WAITING.valueOf() + ': WAITING - Auction not yet started, ' +
                                AuctionApiState.LISTED.valueOf() + ': LISTED - Auction pending and open to bids, ' +
                                AuctionApiState.CANCELED.valueOf() + ': CANCELED - Auction was canceled, ' +
                                AuctionApiState.SOLD.valueOf() + ': SOLD - Auction has been sold, ' +
                                AuctionApiState.INVALID.valueOf() + ': INVALID - Auction ended but no bid was made' +
                                ') - separate multiple with ","',
                            required: false,
                            schema: {type: 'string'}
                        },
                        {
                            name: 'type',
                            in: 'query',
                            description: 'Filter by auction type (' +
                                AuctionType.ENGLISH.valueOf() + ': ENGLISH - Actions that go up on price, ' +
                                AuctionType.DUTCH.valueOf() + ': DUTCH - Auctions thatt go down in price ' +
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
                        {
                            name: 'show_buy_now_only',
                            in: 'query',
                            description: 'Show auctions with buy now option',
                            required: false,
                            schema: {type: 'boolean'}
                        },
                        ...listingFilterParameters,
                        {
                            name: 'min_buy_now_price',
                            in: 'query',
                            description: 'Buy now lower price limit',
                            required: false,
                            schema: {type: 'number'}
                        },
                        {
                            name: 'max_buy_now_price',
                            in: 'query',
                            description: 'Buy now upper price limit',
                            required: false,
                            schema: {type: 'number'}
                        },
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
                                    'created', 'updated', 'starting', 'ending', 'auction_id',
                                    'price', 'buy_now_price', 'template_mint'
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
