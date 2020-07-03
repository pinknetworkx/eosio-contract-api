import * as express from 'express';
import PQueue from 'p-queue';

import { AtomicAssetsNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { filterQueryArgs } from '../../utils';
import logger from '../../../../utils/winston';
import { fillTransfers } from '../filler';
import { getOpenAPI3Responses, paginationParameters } from '../../../docs';

export class TransferApi {
    constructor(
        readonly core: AtomicAssetsNamespace,
        readonly server: HTTPServer,
        readonly schema: string,
        readonly transferView: string,
        readonly transferFormatter: (_: any) => any,
        readonly assetView: string,
        readonly assetFormatter: (_: any) => any
    ) { }

    endpoints(router: express.Router): any {
        router.get('/v1/transfers', this.server.web.caching(), (async (req, res) => {
            try {
                const args = filterQueryArgs(req, {
                    page: {type: 'int', min: 1, default: 1},
                    limit: {type: 'int', min: 1, max: 100, default: 100},
                    sort: {type: 'string', values: ['created'], default: 'created'},
                    order: {type: 'string', values: ['asc', 'desc'], default: 'desc'},

                    account: {type: 'string', min: 1},
                    sender: {type: 'string', min: 1},
                    recipient: {type: 'string', min: 1},
                    asset_id: {type: 'string', min: 1}
                });

                let varCounter = 1;
                let queryString = 'SELECT * FROM ' + this.transferView + ' transfer WHERE contract = $1 ';

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

                if (args.asset_id) {
                    queryString += 'AND EXISTS(' +
                        'SELECT transfer_id FROM atomicassets_transfers_assets asset ' +
                        'WHERE transfer.contract = asset.contract AND transfer.transfer_id = asset.transfer_id AND ' +
                        'asset_id = ANY ($' + ++varCounter + ')' +
                        ') ';
                    queryValues.push(args.asset_id.split(','));
                }

                const sortColumnMapping = {
                    created: 'transfer_id'
                };

                // @ts-ignore
                queryString += 'ORDER BY ' + sortColumnMapping[args.sort] + ' ' + args.order + ' ';
                queryString += 'LIMIT $' + ++varCounter + ' OFFSET $' + ++varCounter + ' ';
                queryValues.push(args.limit);
                queryValues.push((args.page - 1) * args.limit);

                logger.debug(queryString);

                const query = await this.core.connection.database.query(queryString, queryValues);
                const transfers = await fillTransfers(
                    this.core.connection, this.core.args.atomicassets_account,
                    query.rows.map((row) => this.transferFormatter(row)),
                    this.assetFormatter, this.assetView
                );

                return res.json({success: true, data: transfers, query_time: Date.now()});
            } catch (e) {
                logger.error(req.originalUrl + ' ', e);

                res.status(500).json({success: false, message: 'Internal Server Error'});
            }
        }));

        return {
            tag: {
                name: 'transfers',
                description: 'Transfers'
            },
            paths: {
                '/v1/transfers': {
                    get: {
                        tags: ['transfers'],
                        summary: 'Fetch transfers',
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
                                description: 'Transfer sender - separate multiple with ","',
                                required: false,
                                schema: {type: 'string'}
                            },
                            {
                                name: 'recipient',
                                in: 'query',
                                description: 'Transfer recipient - separate multiple with ","',
                                required: false,
                                schema: {type: 'string'}
                            },
                            {
                                name: 'asset_id',
                                in: 'query',
                                description: 'Asset which is in the transfer - separate multiple with ","',
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
                }
            }
        };
    }

    sockets(): void {
        const namespace = this.server.socket.io.of(this.core.path + '/v1/transfers');

        namespace.on('connection', async (socket) => {
            logger.debug('socket transfer client connected');

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

        const transferChannelName = [
            'eosio-contract-api', this.core.connection.chain.name, this.core.args.connected_reader,
            'atomicassets', this.core.args.atomicassets_account, 'transfers'
        ].join(':');
        this.core.connection.redis.ioRedisSub.subscribe(transferChannelName, () => {
            this.core.connection.redis.ioRedisSub.on('message', async (channel, message) => {
                if (channel !== transferChannelName) {
                    return;
                }

                const msg = JSON.parse(message);

                await queue.add(async () => {
                    const query = await this.core.connection.database.query(
                        'SELECT * FROM ' + this.transferView + ' WHERE contract = $1 AND transfer_id = $2',
                        [this.core.args.atomicassets_account, msg.data.transfer_id]
                    );

                    if (query.rowCount === 0) {
                        logger.error('Received transfer notification but did not find transfer in database');

                        return;
                    }

                    const transfers = await fillTransfers(
                        this.core.connection, this.core.args.atomicassets_account,
                        query.rows.map((row) => this.transferFormatter(row)),
                        this.assetFormatter, this.assetView
                    );
                    const transfer = transfers[0];

                    if (msg.action === 'create') {
                        namespace.emit('new_transfer', {
                            transaction: msg.transaction,
                            block: msg.block,
                            transfer: transfer
                        });
                    }
                });
            });
        });
    }
}
