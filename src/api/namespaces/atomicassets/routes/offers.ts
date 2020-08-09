import * as express from 'express';
import PQueue from 'p-queue';

import { AtomicAssetsNamespace } from '../index';
import { HTTPServer } from '../../../server';
import logger from '../../../../utils/winston';
import { buildBoundaryFilter, filterQueryArgs } from '../../utils';
import { fillOffers } from '../filler';
import { getOpenAPI3Responses, paginationParameters } from '../../../docs';
import { OfferState } from '../../../../filler/handlers/atomicassets';
import { getLogs } from '../utils';
import { greylistFilterParameters } from '../openapi';

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
                    sort: {type: 'string', values: ['created', 'updated'], default: 'created'},
                    order: {type: 'string', values: ['asc', 'desc'], default: 'desc'},

                    account: {type: 'string', min: 1},
                    sender: {type: 'string', min: 1},
                    recipient: {type: 'string', min: 1},
                    state: {type: 'string', min: 1},

                    collection_blacklist: {type: 'string', min: 1},
                    collection_whitelist: {type: 'string', min: 1},

                    asset_id: {type: 'string', min: 1},
                    is_recipient_contract: {type: 'bool'}
                });

                let varCounter = 1;
                let queryString = 'SELECT contract, offer_id FROM atomicassets_offers offer WHERE contract = $1 ';

                const queryValues: any[] = [this.core.args.atomicassets_account];

                if (args.account) {
                    queryString += 'AND (sender = ANY ($' + ++varCounter + ') OR recipient = ANY ($' + varCounter + ')) ';
                    queryValues.push(args.account.split(','));
                }

                if (args.sender) {
                    queryString += 'AND sender = ANY ($' + ++varCounter + ') ';
                    queryValues.push(args.sender.split(','));
                }

                if (args.recipient) {
                    queryString += 'AND recipient = ANY ($' + ++varCounter + ') ';
                    queryValues.push(args.recipient.split(','));
                }

                if (args.state) {
                    queryString += 'AND state = ANY ($' + ++varCounter + ') ';
                    queryValues.push(args.state.split(','));
                }

                if (args.is_recipient_contract === true) {
                    queryString += 'AND EXISTS(SELECT * FROM contract_codes WHERE account = offer.recipient) ';
                } else if (args.is_recipient_contract === false) {
                    queryString += 'AND NOT EXISTS(SELECT * FROM contract_codes WHERE account = offer.recipient) ';
                }

                if (args.asset_id) {
                    queryString += 'AND EXISTS(' +
                        'SELECT * FROM atomicassets_offers_assets asset ' +
                        'WHERE asset.contract = offer.contract AND ' +
                        'asset.offer_id = offer.offer_id AND ' +
                        'asset.asset_id = ANY ($' + ++varCounter + ')' +
                        ') ';
                    queryValues.push(args.asset_id.split(','));
                }

                if (args.collection_blacklist) {
                    queryString += 'AND NOT EXISTS(' +
                        'SELECT * FROM atomicassets_offers_assets asset_o, atomicassets_assets asset_a ' +
                        'WHERE asset_o.contract = offer.contract AND asset_o.offer_id = offer.offer_id AND ' +
                        'asset_o.contract = asset_a.contract AND asset_o.asset_id = asset_a.asset_id AND ' +
                        'asset_a.collection_name = ANY ($' + ++varCounter + ')' +
                        ') ';
                    queryValues.push(args.collection_blacklist.split(','));
                }

                if (args.collection_whitelist) {
                    queryString += 'AND NOT EXISTS(' +
                        'SELECT * FROM atomicassets_offers_assets asset_o, atomicassets_assets asset_a ' +
                        'WHERE asset_o.contract = offer.contract AND asset_o.offer_id = offer.offer_id AND ' +
                        'asset_o.contract = asset_a.contract AND asset_o.asset_id = asset_a.asset_id AND ' +
                        'NOT (asset_a.collection_name = ANY ($' + ++varCounter + '))' +
                        ') ';
                    queryValues.push(args.collection_whitelist.split(','));
                }

                const boundaryFilter = buildBoundaryFilter(
                    req, varCounter, 'offer_id', 'int',
                    args.sort === 'updated' ? 'updated_at_time' : 'created_at_time', args.sort === 'updated' ? 'updated_at_block' : 'created_at_block'
                );
                queryValues.push(...boundaryFilter.values);
                varCounter += boundaryFilter.values.length;
                queryString += boundaryFilter.str;

                const sortColumnMapping = {
                    created: 'offer_id',
                    updated: 'updated_at_block'
                };

                // @ts-ignore
                queryString += 'ORDER BY ' + sortColumnMapping[args.sort] + ' ' + args.order + ', offer_id ASC ';
                queryString += 'LIMIT $' + ++varCounter + ' OFFSET $' + ++varCounter + ' ';
                queryValues.push(args.limit);
                queryValues.push((args.page - 1) * args.limit);

                logger.debug(queryString);

                const offerQuery = await this.core.connection.database.query(queryString, queryValues);

                const offerLookup: {[key: string]: any} = {};
                const query = await this.core.connection.database.query(
                    'SELECT * FROM ' + this.offerView + ' WHERE contract = $1 AND offer_id = ANY ($2)',
                    [this.core.args.atomicassets_account, offerQuery.rows.map(row => row.offer_id)]
                );

                query.rows.reduce((prev, current) => {
                    prev[String(current.offer_id)] = current;

                    return prev;
                }, offerLookup);

                const offers = await fillOffers(
                    this.core.connection, this.core.args.atomicassets_account,
                    offerQuery.rows.map((row) => this.offerFormatter(offerLookup[row.offer_id])),
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

        router.get('/v1/offers/:offer_id/logs', this.server.web.caching(), (async (req, res) => {
            const args = filterQueryArgs(req, {
                page: {type: 'int', min: 1, default: 1},
                limit: {type: 'int', min: 1, max: 100, default: 100},
                order: {type: 'string', values: ['asc', 'desc'], default: 'asc'}
            });

            try {
                res.json({
                    success: true,
                    data: await getLogs(
                        this.core.connection.database, this.core.args.atomicassets_account, 'offer', req.params.offer_id,
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
                            ...greylistFilterParameters,
                            ...paginationParameters,
                            {
                                name: 'sort',
                                in: 'query',
                                description: 'Column to sort',
                                required: false,
                                schema: {
                                    type: 'string',
                                    enum: ['created', 'updated'],
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
                },
                '/v1/offers/{offer_id}/logs': {
                    get: {
                        tags: ['offers'],
                        summary: 'Fetch offer logs',
                        parameters: [
                            {
                                name: 'offer_id',
                                in: 'path',
                                description: 'ID of offer',
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

            socket.on('disconnect', async () => {
                if (verifiedConnection) {
                    await this.server.socket.releaseConnection(socket);
                }
            });
        });

        const queue = new PQueue({
            autoStart: true,
            concurrency: 1
        });

        const offerChannelName = [
            'eosio-contract-api', this.core.connection.chain.name, this.core.args.connected_reader,
            'atomicassets', this.core.args.atomicassets_account, 'offers'
        ].join(':');
        this.core.connection.redis.ioRedisSub.setMaxListeners(this.core.connection.redis.ioRedisSub.getMaxListeners() + 1);
        this.core.connection.redis.ioRedisSub.subscribe(offerChannelName, () => {
            this.core.connection.redis.ioRedisSub.on('message', async (channel, message) => {
                if (channel !== offerChannelName) {
                    return;
                }

                const msg = JSON.parse(message);

                await queue.add(async () => {
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

                    if (msg.action === 'create') {
                        namespace.emit('new_offer', {
                            transaction: msg.transaction,
                            block: msg.block,
                            offer: offer
                        });
                    } else if (msg.action === 'state_change') {
                        offer.state = msg.data.state;

                        namespace.emit('state_change', {
                            transaction: msg.transaction,
                            block: msg.block,
                            offer: offer
                        });
                    }
                });
            });
        });
    }
}
