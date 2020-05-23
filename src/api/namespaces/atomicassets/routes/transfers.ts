import * as express from 'express';

import { AtomicAssetsNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { filterQueryArgs } from '../../utils';
import logger from '../../../../utils/winston';
import { formatTransfer } from '../format';
import { standardArrayFilter } from '../swagger';

export function transfersEndpoints(core: AtomicAssetsNamespace, _: HTTPServer, router: express.Router): any {
    router.get('/v1/transfers', (async (req, res) => {
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
            let queryString = 'SELECT * FROM atomicassets_transfers_master WHERE contract = $1 ';

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

            return res.json({success: true, data: query.rows.map((row) => formatTransfer(row))});
        } catch (e) {
            logger.error(e);

            res.status(500);
            res.json({success: false, message: 'Internal Server Error'});
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
                            description: 'Transfer sender',
                            required: false,
                            type: 'string'
                        },
                        {
                            name: 'recipient',
                            in: 'query',
                            description: 'Transfer recipient',
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
                                    data: {type: 'array', items: {'$ref': '#/definitions/Transfer'}}
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

export type SocketTransferSubscriptionArgs = {
    accounts: string[],
    new_transfers: boolean
};

export function transfersSockets(core: AtomicAssetsNamespace, server: HTTPServer): void {
    const namespace = server.socket.io.of(core.path + '/v1/transfers');

    namespace.on('connection', (socket) => {
        logger.debug('socket transfer client connected');

        socket.on('subscribe', (options: SocketTransferSubscriptionArgs) => {
            logger.debug('transfer socket subscription', options);

            if (Array.isArray(options.accounts)) {
                for (const account of options.accounts) {
                    if (typeof account === 'string') {
                        socket.join('transfers:account:' + account);
                    }
                }
            }

            if (options.new_transfers) {
                socket.join('transfers:new_transfers');
            } else {
                socket.leave('transfers:new_transfers');
            }

            logger.debug('socket rooms updated', server.socket.io.sockets.adapter.sids[socket.id]);
        });
    });

    const channelName = ['eosio-contract-api', core.connection.chain.name, core.args.socket_api_prefix, 'transfers'].join(':');

    core.connection.redis.conn.subscribe(channelName, () => {
        core.connection.redis.conn.on('message', async (channel, message) => {
            if (channel !== channelName) {
                return;
            }

            const msg = JSON.parse(message);

            const query = await core.connection.database.query(
                'SELECT * FROM atomicassets_transfers_master WHERE contract = $1 AND transfer_id = $2',
                [core.args.atomicassets_account, msg.data.transfer_id]
            );

            if (query.rowCount === 0) {
                logger.error('Received transfer notification but did not find transfer in database');

                return;
            }

            const transfer = query.rows[0];

            const rooms = [
                'transfers:account:' + transfer.sender_name, 'transfers:account:' + transfer.recipient_name
            ];

            if (msg.action === 'create') {
                rooms.push('transfers:new_transfers');

                rooms.reduce((previousValue, currentValue) => previousValue.to(currentValue), namespace)
                    .emit('new_transfer', {
                        transaction: msg.transaction,
                        block: msg.block,
                        transfer: formatTransfer(transfer)
                    });
            }
        });
    });
}
