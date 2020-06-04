import * as express from 'express';

import { AtomicAssetsNamespace } from '../index';
import { HTTPServer } from '../../../server';
import logger from '../../../../utils/winston';
import { filterQueryArgs } from '../../utils';
import { formatOffer } from '../format';
import { standardArrayFilter } from '../swagger';

export function offersEndpoints(core: AtomicAssetsNamespace, server: HTTPServer, router: express.Router): any {
    router.get('/v1/offers', server.web.caching({ contentType: 'text/json' }), (async (req, res) => {
        try {
            const args = filterQueryArgs(req, {
                page: {type: 'int', min: 1, default: 1},
                limit: {type: 'int', min: 1, max: 100, default: 100},
                sort: {type: 'string', values: ['created'], default: 'created'},
                order: {type: 'string', values: ['asc', 'desc'], default: 'desc'},

                account: {type: 'string', min: 1, max: 12},
                sender: {type: 'string', min: 1, max: 12},
                recipient: {type: 'string', min: 1, max: 12}
            });

            let varCounter = 1;
            let queryString = 'SELECT * FROM atomicassets_offers_master WHERE contract = $1 ';

            const queryValues: any[] = [core.args.atomicassets_account];

            if (args.account) {
                queryString += 'AND (sender_name = $' + ++varCounter + ' OR recipient_name = $' + varCounter + ') ';
                queryValues.push(args.account);
            }

            if (args.sender) {
                queryString += 'AND sender_name = $' + ++varCounter + ' ';
                queryValues.push(args.sender);
            }

            if (args.recipient) {
                queryString += 'AND recipient_name = $' + ++varCounter + ' ';
                queryValues.push(args.recipient);
            }

            const sortColumnMapping = {
                created: 'created_at_block'
            };

            // @ts-ignore
            queryString += 'ORDER BY ' + sortColumnMapping[args.sort] + ' ' + args.order + ' ';
            queryString += 'LIMIT $' + ++varCounter + ' OFFSET $' + ++varCounter + ' ';
            queryValues.push(args.limit);
            queryValues.push((args.page - 1) * args.limit);

            logger.debug(queryString);

            const query = await core.connection.database.query(queryString, queryValues);

            return res.json({success: true, data: query.rows.map((row) => formatOffer(row)), query_time: Date.now()});
        } catch (e) {
            logger.error(e);

            res.status(500);
            res.json({success: false, message: 'Internal Server Error'});
        }
    }));

    router.get('/v1/offers/:offer_id', server.web.caching({ contentType: 'text/json' }), (async (req, res) => {
        try {
            const query = await core.connection.database.query(
                'SELECT * FROM atomicassets_offers_master WHERE contract = $1 AND offer_id = $2',
                [core.args.atomicassets_account, req.params.offer_id]
            );

            if (query.rowCount === 0) {
                res.status(500);

                return res.json({success: false, message: 'Offer not found'});
            }

            return res.json({success: true, data: formatOffer(query.rows[0]), query_time: Date.now()});
        } catch (e) {
            logger.error(e);

            res.status(500);
            return res.json({success: false, message: 'Internal Server Error'});
        }
    }));

    return {
        tag: {
            name: 'offers',
            description: 'Offers'
        },
        paths: {
            '/v1/offers': {
                get: {
                    tags: ['offers'],
                    summary: 'Fetch offers',
                    produces: ['application/json'],
                    parameters: [
                        {
                            name: 'account',
                            in: 'query',
                            description: 'Notified account (can be sender or recipient)',
                            required: false,
                            type: 'string'
                        },
                        {
                            name: 'sender',
                            in: 'query',
                            description: 'Offer sender',
                            required: false,
                            type: 'string'
                        },
                        {
                            name: 'recipient',
                            in: 'query',
                            description: 'Offer recipient',
                            required: false,
                            type: 'string'
                        },
                        ...standardArrayFilter,
                        {
                            name: 'sort',
                            in: 'query',
                            description: 'Column to sort',
                            required: false,
                            type: 'string',
                            enum: ['created'],
                            default: 'created'
                        }
                    ],
                    responses: {
                        '200': {
                            description: 'OK',
                            schema: {
                                type: 'object',
                                properties: {
                                    success: {type: 'boolean', default: true},
                                    data: {type: 'array', items: {'$ref': '#/definitions/Offer'}},
                                    query_time: {type: 'number'}
                                }
                            }
                        },
                        '500': {
                            description: 'Internal Server Error',
                            schema: {
                                type: 'object',
                                properties: {
                                    success: {type: 'boolean', default: false},
                                    message: {type: 'string'}
                                }
                            }
                        }
                    }
                }
            },
            '/v1/offers/{offer_id}': {
                get: {
                    tags: ['offers'],
                    summary: 'Find offer by id',
                    produces: ['application/json'],
                    parameters: [
                        {
                            name: 'offer_id',
                            in: 'path',
                            description: 'ID of offer',
                            required: true,
                            type: 'integer'
                        }
                    ],
                    responses: {
                        '200': {
                            description: 'OK',
                            schema: {
                                type: 'object',
                                properties: {
                                    success: {type: 'boolean', default: true},
                                    data: {'$ref': '#/definitions/Offer'},
                                    query_time: {type: 'number'}
                                }
                            }
                        },
                        '500': {
                            description: 'Internal Server Error',
                            schema: {
                                type: 'object',
                                properties: {
                                    success: {type: 'boolean', default: false},
                                    message: {type: 'string'}
                                }
                            }
                        }
                    }
                }
            }
        },
        definitions: {}
    };
}

export type SocketOfferSubscriptionArgs = {
    offer_ids: string[],
    accounts: string[],
    new_offers: boolean
};

export function offersSockets(core: AtomicAssetsNamespace, server: HTTPServer): void {
    const namespace = server.socket.io.of(core.path + '/v1/offers');

    namespace.on('connection', async (socket) => {
        logger.debug('socket offer client connected');

        let verifiedConnection = false;
        if (!(await server.socket.reserveConnection(socket))) {
            socket.disconnect(true);
        } else {
            verifiedConnection = true;
        }

        socket.on('subscribe', (options: SocketOfferSubscriptionArgs) => {
            if (typeof options !== 'object') {
                return;
            }

            logger.debug('offer socket subscription', options);

            socket.leaveAll();

            const subscribeLimit = server.config.socket_limit.subscriptions_per_connection;
            let subscribeCounter = 0;

            if (Array.isArray(options.offer_ids)) {
                for (const offerId of options.offer_ids) {
                    if (typeof offerId === 'string') {
                        if (subscribeCounter > subscribeLimit) {
                            socket.emit('subscribe_limit', {max_subscriptions: subscribeLimit});

                            return;
                        }

                        socket.join('offers:offer_id:' + offerId);
                        subscribeCounter++;
                    }
                }
            }

            if (Array.isArray(options.accounts)) {
                for (const account of options.accounts) {
                    if (typeof account === 'string') {
                        if (subscribeCounter > subscribeLimit) {
                            socket.emit('subscribe_limit', {max_subscriptions: subscribeLimit});

                            return;
                        }

                        socket.join('offers:account:' + account);
                        subscribeCounter++;
                    }
                }
            }

            if (options.new_offers) {
                if (subscribeCounter > subscribeLimit) {
                    socket.emit('subscribe_limit', {max_subscriptions: subscribeLimit});

                    return;
                }

                socket.join('offers:new_offers');
                subscribeCounter++;
            }

            logger.debug('socket rooms updated', socket.rooms);
        });

        socket.on('disconnect', async () => {
            if (verifiedConnection) {
                await server.socket.releaseConnection(socket);
            }
        });
    });

    const offerChannelName = [
        'eosio-contract-api', core.connection.chain.name, 'atomicassets',
        core.args.atomicassets_account, 'offers'
    ].join(':');
    core.connection.redis.ioRedisSub.subscribe(offerChannelName, () => {
        core.connection.redis.ioRedisSub.on('message', async (channel, message) => {
            if (channel !== offerChannelName) {
                return;
            }

            const msg = JSON.parse(message);

            const query = await core.connection.database.query(
                'SELECT * FROM atomicassets_offers_master WHERE contract = $1 AND offer_id = $2',
                [core.args.atomicassets_account, msg.data.offer_id]
            );

            if (query.rowCount === 0) {
                logger.error('Received offer notification but did not find offer in database');

                return;
            }

            const offer = query.rows[0];

            const rooms = [
                'offers:offer_id:' + offer.offer_id, 'offers:account:' + offer.sender_name, 'offers:account:' + offer.recipient_name
            ];

            if (msg.action === 'create') {
                rooms.push('offers:new_offers');

                rooms.reduce((previousValue, currentValue) => previousValue.to(currentValue), namespace)
                    .emit('new_offer', {
                        transaction: msg.transaction,
                        block: msg.block,
                        offer: formatOffer(offer)
                    });
            } else if (msg.action === 'state_change') {
                offer.state = msg.data.state;

                rooms.reduce((previousValue, currentValue) => previousValue.to(currentValue), namespace)
                    .emit('state_change', {
                        transaction: msg.transaction,
                        block: msg.block,
                        offer: formatOffer(offer)
                    });
            }
        });
    });

    const chainChannelName = ['eosio-contract-api', core.connection.chain.name, 'chain'].join(':');
    core.connection.redis.ioRedisSub.subscribe(chainChannelName, () => {
        core.connection.redis.ioRedisSub.on('message', async (channel, message) => {
            if (channel !== chainChannelName) {
                return;
            }

            const msg = JSON.parse(message);

            if (msg.action === 'fork') {
                namespace.emit('fork', {block_num: msg.block_num});
            }
        });
    });
}
