import * as express from 'express';

import { AtomicAssetsNamespace } from '../index';
import { HTTPServer } from '../../../server';
import logger from '../../../../utils/winston';
import { filterQueryArgs } from '../../utils';
import { formatOffer } from '../format';
import { standardArrayFilter } from '../swagger';

export function offersEndpoints(core: AtomicAssetsNamespace, _: HTTPServer, router: express.Router): any {
    router.get('/v1/offers', (async (req, res) => {
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

            return res.json({success: true, data: query.rows.map((row) => formatOffer(row))});
        } catch (e) {
            logger.error(e);

            res.status(500);
            res.json({success: false, message: 'Internal Server Error'});
        }
    }));

    router.get('/v1/offers/:offer_id', (async (req, res) => {
        try {
            const query = await core.connection.database.query(
                'SELECT * FROM atomicassets_offers_master WHERE contract = $1 AND offer_id = $2',
                [core.args.atomicassets_account, req.params.offer_id]
            );

            if (query.rowCount === 0) {
                res.status(500);

                return res.json({success: false, message: 'Offer not found'});
            }

            return res.json({success: true, data: formatOffer(query.rows[0])});
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
                                    data: {type: 'array', items: {'$ref': '#/definitions/Offer'}}
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
                                    data: {'$ref': '#/definitions/Offer'}
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

    namespace.on('connection', (socket) => {
        logger.debug('socket offer client connected');

        socket.on('subscribe', (options: SocketOfferSubscriptionArgs) => {
            logger.debug('offer subscription', options);

            if (Array.isArray(options.offer_ids)) {
                for (const offerId of options.offer_ids) {
                    if (typeof offerId === 'string') {
                        socket.join('offers:offer_id:' + offerId);
                    }
                }
            }

            if (Array.isArray(options.accounts)) {
                for (const account of options.accounts) {
                    if (typeof account === 'string') {
                        socket.join('offers:account:' + account);
                    }
                }
            }

            if (options.new_offers) {
                socket.join('offers:new_offers');
            } else {
                socket.leave('offers:new_offers');
            }
        });
    });

    const channelName = ['eosio-contract-api', core.connection.chain.name, core.args.socket_api_prefix, 'offers'].join(':');

    core.connection.redis.conn.subscribe(channelName, () => {
        core.connection.redis.conn.on('message', (channel, message) => {
            if (channel !== channelName) {
                return;
            }

            // const data = JSON.parse(message);
        });
    });
}
