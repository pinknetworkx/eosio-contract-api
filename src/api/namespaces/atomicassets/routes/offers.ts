import * as express from 'express';

import { AtomicAssetsNamespace } from '../index';
import { HTTPServer } from '../../../server';
import logger from '../../../../utils/winston';
import { filterQueryArgs } from '../../utils';
import { fillOffers } from '../filler';
import { getOpenAPI3Responses, paginationParameters } from '../../../docs';
import { OfferState } from '../../../../filler/handlers/atomicassets';

export type SocketOfferSubscriptionArgs = {
    offer_ids: string[],
    accounts: string[],
    new_offers: boolean
};

export class OfferApi {
    constructor(
        readonly core: AtomicAssetsNamespace,
        readonly server: HTTPServer,
        readonly schema: string,
        readonly offerView: string,
        readonly offerFormatter: (_: any) => any,
        readonly assetView: string,
        readonly assetFormatter: (_: any) => any
    ) { }

    endpoints(router: express.Router): any {
        router.get('/v1/offers', this.server.web.caching(), (async (req, res) => {
            try {
                const args = filterQueryArgs(req, {
                    page: {type: 'int', min: 1, default: 1},
                    limit: {type: 'int', min: 1, max: 100, default: 100},
                    sort: {type: 'string', values: ['created'], default: 'created'},
                    order: {type: 'string', values: ['asc', 'desc'], default: 'desc'},

                    account: {type: 'string', min: 1},
                    sender: {type: 'string', min: 1},
                    recipient: {type: 'string', min: 1},
                    state: {type: 'string', min: 1},

                    asset_id: {type: 'string', min: 1},
                    is_recipient_contract: {type: 'string'}
                });

                let varCounter = 1;
                let queryString = 'SELECT * FROM ' + this.offerView + ' offer WHERE contract = $1 ';

                const queryValues: any[] = [this.core.args.atomicassets_account];

                if (args.account) {
                    queryString += 'AND (sender_name = ANY ($' + ++varCounter + ') OR recipient_name = ANY ($' + varCounter + ')) ';
                    queryValues.push(args.account.split(','));
                }

                if (args.sender) {
                    queryString += 'AND sender_name = ANY ($' + ++varCounter + ') ';
                    queryValues.push(args.sender.split(','));
                }

                if (args.recipient) {
                    queryString += 'AND recipient_name = ANY ($' + ++varCounter + ') ';
                    queryValues.push(args.recipient.split(','));
                }

                if (args.state) {
                    queryString += 'AND state = ANY ($' + ++varCounter + ') ';
                    queryValues.push(args.state.split(','));
                }

                if (args.is_recipient_contract === true) {
                    queryString += 'AND recipient_contract_account IS NOT NULL ';
                } else if (args.is_recipient_contract === true) {
                    queryString += 'AND recipient_contract_account IS NULL ';
                }

                if (args.asset_id) {
                    queryString += 'AND EXISTS(' +
                        'SELECT offer_id FROM atomicassets_offers_assets asset ' +
                        'WHERE asset.contract = offer.contract AND ' +
                        'asset.offer_id = offer.offer_id AND ' +
                        'asset.asset_id = ANY ($' + ++varCounter + ')' +
                        ') ';
                    queryValues.push(args.asset_id.split(','));
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

                const query = await this.core.connection.database.query(queryString, queryValues);
                const offers = await fillOffers(
                    this.core.connection, this.core.args.atomicassets_account,
                    query.rows.map((row) => this.offerFormatter(row)),
                    this.assetFormatter, this.assetView
                );

                return res.json({success: true, data: offers, query_time: Date.now()});
            } catch (e) {
                logger.error(req.originalUrl + ' ', e);

                res.status(500).json({success: false, message: 'Internal Server Error'});
            }
        }));

        router.get('/v1/offers/:offer_id', this.server.web.caching({ignoreQueryString: true}), (async (req, res) => {
            try {
                const query = await this.core.connection.database.query(
                    'SELECT * FROM atomicassets_offers_master WHERE contract = $1 AND offer_id = $2',
                    [this.core.args.atomicassets_account, req.params.offer_id]
                );

                if (query.rowCount === 0) {
                    return res.status(416).json({success: false, message: 'Offer not found'});
                }

                const offers = await fillOffers(
                    this.core.connection, this.core.args.atomicassets_account,
                    query.rows.map((row) => this.offerFormatter(row)),
                    this.assetFormatter, this.assetView
                );

                return res.json({success: true, data: offers[0], query_time: Date.now()});
            } catch (e) {
                logger.error(req.originalUrl + ' ', e);

                return res.status(500).json({success: false, message: 'Internal Server Error'});
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
                        parameters: [
                            {
                                name: 'account',
                                in: 'query',
                                description: 'Notified account (can be sender or recipient) - separate multiple with ","',
                                required: false,
                                schema: {type: 'string'}
                            },
                            {
                                name: 'sender',
                                in: 'query',
                                description: 'Offer sender - separate multiple with ","',
                                required: false,
                                schema: {type: 'string'}
                            },
                            {
                                name: 'recipient',
                                in: 'query',
                                description: 'Offer recipient - separate multiple with ","',
                                required: false,
                                schema: {type: 'string'}
                            },
                            {
                                name: 'state',
                                in: 'query',
                                description: 'Filter by Offer State (' +
                                    OfferState.PENDING.valueOf() + ': PENDING - Offer created and valid, ' +
                                    OfferState.INVALID.valueOf() + ': INVALID - Assets are missing because ownership has changed, ' +
                                    OfferState.UNKNOWN.valueOf() + ': UNKNOWN - Offer is not valid anymore, ' +
                                    OfferState.ACCEPTED.valueOf() + ': ACCEPTED - Offer was accepted, ' +
                                    OfferState.DECLINED.valueOf() + ': DECLINED - Offer was declined by recipient, ' +
                                    OfferState.CANCELLED.valueOf() + ': CANCELLED - Offer was canceled by sender' +
                                    ') - separate multiple with ","',
                                required: false,
                                schema: {type: 'string'}
                            },
                            {
                                name: 'is_recipient_contract',
                                in: 'query',
                                description: 'Filter offers where recipient is a contract',
                                required: false,
                                schema: {type: 'boolean'}
                            },
                            {
                                name: 'asset_id',
                                in: 'query',
                                description: 'Asset which is in the offer - separate multiple with ","',
                                required: false,
                                schema: {type: 'string'}
                            },
                            ...paginationParameters,
                            {
                                name: 'sort',
                                in: 'query',
                                description: 'Column to sort',
                                required: false,
                                schema: {
                                    type: 'string',
                                    enum: ['created'],
                                    default: 'created'
                                }
                            }
                        ],
                        responses: getOpenAPI3Responses([200, 500], {type: 'array', items: {'$ref': '#/components/schemas/' + this.schema}})
                    }
                },
                '/v1/offers/{offer_id}': {
                    get: {
                        tags: ['offers'],
                        summary: 'Find offer by id',
                        parameters: [
                            {
                                name: 'offer_id',
                                in: 'path',
                                description: 'ID of offer',
                                required: true,
                                schema: {type: 'integer'}
                            }
                        ],
                        responses: getOpenAPI3Responses([200, 416, 500], {'$ref': '#/components/schemas/' + this.schema})
                    }
                }
            }
        };
    }

    sockets(): void {
        const namespace = this.server.socket.io.of(this.core.path + '/v1/offers');

        namespace.on('connection', async (socket) => {
            logger.debug('socket offer client connected');

            let verifiedConnection = false;
            if (!(await this.server.socket.reserveConnection(socket))) {
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

                const subscribeLimit = this.server.config.socket_limit.subscriptions_per_connection;
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
                    await this.server.socket.releaseConnection(socket);
                }
            });
        });

        const offerChannelName = [
            'eosio-contract-api', this.core.connection.chain.name, this.core.args.connected_reader,
            'atomicassets', this.core.args.atomicassets_account, 'offers'
        ].join(':');
        this.core.connection.redis.ioRedisSub.subscribe(offerChannelName, () => {
            this.core.connection.redis.ioRedisSub.on('message', async (channel, message) => {
                if (channel !== offerChannelName) {
                    return;
                }

                const msg = JSON.parse(message);

                const query = await this.core.connection.database.query(
                    'SELECT * FROM ' + this.offerView + ' WHERE contract = $1 AND offer_id = $2',
                    [this.core.args.atomicassets_account, msg.data.offer_id]
                );

                if (query.rowCount === 0) {
                    logger.error('Received offer notification but did not find offer in database');

                    return;
                }

                const offers = await fillOffers(
                    this.core.connection, this.core.args.atomicassets_account,
                    query.rows.map((row) => this.offerFormatter(row)),
                    this.assetFormatter, this.assetView
                );

                const offer = offers[0];

                const rooms = [
                    'offers:offer_id:' + offer.offer_id, 'offers:account:' + offer.sender_name, 'offers:account:' + offer.recipient_name
                ];

                if (msg.action === 'create') {
                    rooms.push('offers:new_offers');

                    rooms.reduce((previousValue, currentValue) => previousValue.to(currentValue), namespace)
                        .emit('new_offer', {
                            transaction: msg.transaction,
                            block: msg.block,
                            offer: offer
                        });
                } else if (msg.action === 'state_change') {
                    offer.state = msg.data.state;

                    rooms.reduce((previousValue, currentValue) => previousValue.to(currentValue), namespace)
                        .emit('state_change', {
                            transaction: msg.transaction,
                            block: msg.block,
                            offer: offer
                        });
                }
            });
        });

        const chainChannelName = [
            'eosio-contract-api', this.core.connection.chain.name, this.core.args.connected_reader, 'chain'
        ].join(':');
        this.core.connection.redis.ioRedisSub.subscribe(chainChannelName, () => {
            this.core.connection.redis.ioRedisSub.on('message', async (channel, message) => {
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
}
