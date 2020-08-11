import * as express from 'express';
import PQueue from 'p-queue';

import { AtomicMarketNamespace, AuctionApiState } from '../index';
import { HTTPServer } from '../../../server';
import { formatAuction } from '../format';
import { fillAuctions } from '../filler';
import { buildAuctionFilter } from '../utils';
import { dateBoundaryParameters, getOpenAPI3Responses, paginationParameters, primaryBoundaryParameters } from '../../../docs';
import { assetFilterParameters, atomicDataFilter } from '../../atomicassets/openapi';
import logger from '../../../../utils/winston';
import { buildBoundaryFilter, filterQueryArgs } from '../../utils';
import { listingFilterParameters } from '../openapi';
import { buildGreylistFilter, getLogs } from '../../atomicassets/utils';

export function auctionsEndpoints(core: AtomicMarketNamespace, server: HTTPServer, router: express.Router): any {
    router.get('/v1/auctions', server.web.caching(), async (req, res) => {
        try {
            const args = filterQueryArgs(req, {
                page: {type: 'int', min: 1, default: 1},
                limit: {type: 'int', min: 1, max: 100, default: 100},
                sort: {type: 'string', values: ['created', 'updated', 'ending', 'auction_id', 'price'], default: 'created'},
                order: {type: 'string', values: ['asc', 'desc'], default: 'desc'}
            });

            const auctionFilter = buildAuctionFilter(req, 1);

            let queryString = 'SELECT * FROM atomicmarket_auctions_master listing WHERE market_contract = $1 ' + auctionFilter.str;
            const queryValues = [core.args.atomicmarket_account, ...auctionFilter.values];
            let varCounter = queryValues.length;

            const blacklistFilter = buildGreylistFilter(req, varCounter, 'listing.collection_name');
            queryValues.push(...blacklistFilter.values);
            varCounter += blacklistFilter.values.length;
            queryString += blacklistFilter.str;

            const boundaryFilter = buildBoundaryFilter(
                req, varCounter, 'auction_id', 'int',
                args.sort === 'updated' ? 'listing.updated_at_time' : 'listing.created_at_time',
                args.sort === 'updated' ? 'listing.updated_at_block' : 'listing.created_at_block'
            );
            queryValues.push(...boundaryFilter.values);
            varCounter += boundaryFilter.values.length;
            queryString += boundaryFilter.str;

            const sortColumnMapping = {
                auction_id: 'auction_id',
                ending: 'end_time',
                created: 'auction_id',
                updated: 'updated_at_block',
                price: 'raw_price'
            };

            // @ts-ignore
            queryString += 'ORDER BY ' + sortColumnMapping[args.sort] + ' ' + args.order + ' NULLS LAST, listing.auction_id ASC ';
            queryString += 'LIMIT $' + ++varCounter + ' OFFSET $' + ++varCounter + ' ';
            queryValues.push(args.limit);
            queryValues.push((args.page - 1) * args.limit);

            logger.debug(queryString);

            const query = await core.connection.database.query(queryString, queryValues);

            const auctions = await fillAuctions(
                core.connection, core.args.atomicassets_account, query.rows.map((row) => formatAuction(row))
            );

            res.json({success: true, data: auctions, query_time: Date.now()});
        } catch (e) {
            logger.error(req.originalUrl + ' ', e);

            res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    });

    router.get('/v1/auctions/:auction_id', server.web.caching(), async (req, res) => {
        try {
            const query = await core.connection.database.query(
                'SELECT * FROM atomicmarket_auctions_master WHERE market_contract = $1 AND auction_id = $2',
                [core.args.atomicmarket_account, req.params.auction_id]
            );

            if (query.rowCount === 0) {
                res.status(416).json({success: false, message: 'Auction not found'});
            } else {
                const auctions = await fillAuctions(
                    core.connection, core.args.atomicassets_account, query.rows.map((row) => formatAuction(row))
                );

                res.json({success: true, data: auctions[0], query_time: Date.now()});
            }
        } catch (e) {
            logger.error(req.originalUrl + ' ', e);

            res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    });

    router.get('/v1/auctions/:auction_id/logs', server.web.caching(), (async (req, res) => {
        const args = filterQueryArgs(req, {
            page: {type: 'int', min: 1, default: 1},
            limit: {type: 'int', min: 1, max: 100, default: 100},
            order: {type: 'string', values: ['asc', 'desc'], default: 'asc'}
        });

        try {
            res.json({
                success: true,
                data: await getLogs(
                    core.connection.database, core.args.atomicmarket_account, 'auction', req.params.auction_id,
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
                                enum: ['created', 'updated', 'ending', 'auction_id', 'price'],
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
                        ...paginationParameters
                    ],
                    responses: getOpenAPI3Responses([200, 500], {type: 'array', items: {'$ref': '#/components/schemas/Log'}})
                }
            }
        }
    };
}

export function auctionSockets(core: AtomicMarketNamespace, server: HTTPServer): void {
    const namespace = server.socket.io.of(core.path + '/v1/auctions');

    namespace.on('connection', async (socket) => {
        logger.debug('socket auction client connected');

        let verifiedConnection = false;
        if (!(await server.socket.reserveConnection(socket))) {
            socket.disconnect(true);
        } else {
            verifiedConnection = true;
        }

        socket.on('disconnect', async () => {
            if (verifiedConnection) {
                await server.socket.releaseConnection(socket);
            }
        });
    });

    const queue = new PQueue({
        autoStart: true,
        concurrency: 1
    });

    async function checkAuction(auctionID: string): Promise<void> {
        await queue.add(async () => {
            const query = await core.connection.database.query(
                'SELECT * FROM atomicmarket_auctions_master WHERE market_contract = $1 AND auction_id = $2',
                [core.args.atomicmarket_account, auctionID]
            );

            const auction = formatAuction(query.rows[0]);

            if ([AuctionApiState.SOLD.valueOf(), AuctionApiState.INVALID.valueOf()].indexOf(parseInt(auction.state, 10))) {
                const filledAuction = (await fillAuctions(core.connection, core.args.atomicassets_account, [auction]))[0];

                namespace.emit('state_change', {
                    transaction: null,
                    block: null,
                    auction_id: auction.auction_id,
                    state: auction.state,
                    auction: filledAuction
                });
            }
        });
    }

    const auctionChannelName = [
        'eosio-contract-api', core.connection.chain.name, core.args.connected_reader,
        'atomicmarket', core.args.atomicmarket_account, 'auctions'
    ].join(':');
    core.connection.redis.ioRedisSub.setMaxListeners(core.connection.redis.ioRedisSub.getMaxListeners() + 1);
    core.connection.redis.ioRedisSub.subscribe(auctionChannelName, () => {
        core.connection.redis.ioRedisSub.on('message', async (channel, message) => {
            if (channel !== auctionChannelName) {
                return;
            }

            const msg = JSON.parse(message);

            await queue.add(async () => {
                const query = await core.connection.database.query(
                    'SELECT * FROM atomicmarket_auctions_master WHERE market_contract = $1 AND auction_id = $2',
                    [core.args.atomicmarket_account, msg.data.auction_id]
                );

                if (query.rowCount === 0) {
                    logger.error('Received auction notification but did not find auction in database');

                    return;
                }

                const auctions = await fillAuctions(
                    core.connection, core.args.atomicassets_account,
                    query.rows.map((row: any) => formatAuction(row))
                );

                const auction = auctions[0];

                if (msg.action === 'create') {
                    namespace.emit('new_auction', {
                        transaction: msg.transaction,
                        block: msg.block,
                        auction_id: auction.auction_id,
                        auction: auction
                    });
                } else if (msg.action === 'state_change') {
                    namespace.emit('state_change', {
                        transaction: msg.transaction,
                        block: msg.block,
                        auction_id: auction.auction_id,
                        state: auction.state,
                        auction: auction
                    });
                } else if (msg.action === 'bid') {
                    namespace.emit('new_bid', {
                        transaction: msg.transaction,
                        block: msg.block,
                        auction_id: auction.auction_id,
                        bid: {
                            number: msg.data.bid.bid_number,
                            account: msg.data.bid.account,
                            amount: msg.data.bid.amount,
                            created_at_block: msg.data.bid.created_at_block,
                            created_at_time: msg.data.bid.created_at_time,
                            txid: msg.transaction.id
                        },
                        auction: auction
                    });

                    setTimeout(() => {
                        checkAuction(auction.auction_id);
                    }, Date.now() + 1000 - auction.end_time * 1000);
                }
            });
        });
    });
}
