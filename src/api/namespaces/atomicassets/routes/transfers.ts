import * as express from 'express';

import { AtomicAssetsNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { buildBoundaryFilter, filterQueryArgs } from '../../utils';
import { FillerHook, fillTransfers } from '../filler';
import { getOpenAPI3Responses, paginationParameters } from '../../../docs';
import { greylistFilterParameters } from '../openapi';
import ApiNotificationReceiver from '../../../notification';
import { createSocketApiNamespace } from '../../../utils';
import { NotificationData } from '../../../../filler/notifier';

export class TransferApi {
    constructor(
        readonly core: AtomicAssetsNamespace,
        readonly server: HTTPServer,
        readonly schema: string,
        readonly transferView: string,
        readonly transferFormatter: (_: any) => any,
        readonly assetView: string,
        readonly assetFormatter: (_: any) => any,
        readonly fillerHook?: FillerHook
    ) { }

    endpoints(router: express.Router): any {
        router.all(['/v1/transfers', '/v1/transfers/_count'], this.server.web.caching(), (async (req, res) => {
            try {
                const args = filterQueryArgs(req, {
                    page: {type: 'int', min: 1, default: 1},
                    limit: {type: 'int', min: 1, max: 100, default: 100},
                    sort: {type: 'string', values: ['created'], default: 'created'},
                    order: {type: 'string', values: ['asc', 'desc'], default: 'desc'},

                    asset_id: {type: 'string', min: 1},
                    collection_name: {type: 'string', min: 1},
                    template_id: {type: 'string', min: 1},
                    schema_name: {type: 'string', min: 1},
                    collection_blacklist: {type: 'string', min: 1},
                    collection_whitelist: {type: 'string', min: 1},

                    account: {type: 'string', min: 1},
                    sender: {type: 'string', min: 1},
                    recipient: {type: 'string', min: 1}
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

                if (['collection_name', 'template_id', 'schema_name'].find(key => args[key])) {
                    const conditions: string[] = [];

                    if (args.asset_id) {
                        conditions.push('transfer_asset.asset_id = ANY ($' + ++varCounter + ')');
                        queryValues.push(args.asset_id.split(','));
                    }

                    if (args.collection_name) {
                        conditions.push('asset.collection_name = ANY ($' + ++varCounter + ')');
                        queryValues.push(args.collection_name.split(','));
                    }

                    if (args.template_id) {
                        conditions.push('asset.template_id = ANY ($' + ++varCounter + ')');
                        queryValues.push(args.template_id.split(','));
                    }

                    if (args.schema_name) {
                        conditions.push('asset.schema_name = ANY ($' + ++varCounter + ')');
                        queryValues.push(args.schema_name.split(','));
                    }

                    queryString += 'AND EXISTS(' +
                        'SELECT * FROM atomicassets_transfers_assets transfer_asset, atomicassets_assets asset ' +
                        'WHERE transfer_asset.contract = transfer.contract AND transfer_asset.transfer_id = transfer.transfer_id AND ' +
                        'transfer_asset.contract = asset.contract AND transfer_asset.asset_id = asset.asset_id AND (' + conditions.join(' OR ') + ')) ';
                }

                if (args.asset_id) {
                    queryString += 'AND EXISTS(' +
                        'SELECT * FROM atomicassets_transfers_assets asset ' +
                        'WHERE transfer.contract = asset.contract AND transfer.transfer_id = asset.transfer_id AND ' +
                        'asset_id = ANY ($' + ++varCounter + ')' +
                        ') ';
                    queryValues.push(args.asset_id.split(','));
                }

                if (args.collection_blacklist) {
                    queryString += 'AND NOT EXISTS(' +
                        'SELECT * FROM atomicassets_transfers_assets transfer_asset, atomicassets_assets asset ' +
                        'WHERE transfer_asset.contract = transfer.contract AND transfer_asset.transfer_id = transfer.transfer_id AND ' +
                        'transfer_asset.contract = asset.contract AND transfer_asset.asset_id = asset.asset_id AND ' +
                        'asset.collection_name = ANY ($' + ++varCounter + ')' +
                        ') ';
                    queryValues.push(args.collection_blacklist.split(','));
                }

                if (args.collection_whitelist) {
                    queryString += 'AND NOT EXISTS(' +
                        'SELECT * FROM atomicassets_transfers_assets transfer_asset, atomicassets_assets asset ' +
                        'WHERE transfer_asset.contract = transfer.contract AND transfer_asset.transfer_id = transfer.transfer_id AND ' +
                        'transfer_asset.contract = asset.contract AND transfer_asset.asset_id = asset.asset_id AND ' +
                        'NOT (asset.collection_name = ANY ($' + ++varCounter + '))' +
                        ') ';
                    queryValues.push(args.collection_whitelist.split(','));
                }

                const boundaryFilter = buildBoundaryFilter(
                    req, varCounter, 'transfer_id', 'int',
                    'created_at_time'
                );
                queryValues.push(...boundaryFilter.values);
                varCounter += boundaryFilter.values.length;
                queryString += boundaryFilter.str;

                if (req.originalUrl.search('/_count') >= 0) {
                    const countQuery = await this.server.query(
                        'SELECT COUNT(*) counter FROM (' + queryString + ') x',
                        queryValues
                    );

                    return res.json({success: true, data: countQuery.rows[0].counter, query_time: Date.now()});
                }

                const sortColumnMapping = {
                    created: 'transfer_id'
                };

                // @ts-ignore
                queryString += 'ORDER BY ' + sortColumnMapping[args.sort] + ' ' + args.order + ' ';
                queryString += 'LIMIT $' + ++varCounter + ' OFFSET $' + ++varCounter + ' ';
                queryValues.push(args.limit);
                queryValues.push((args.page - 1) * args.limit);

                const query = await this.server.query(queryString, queryValues);
                const transfers = await fillTransfers(
                    this.server, this.core.args.atomicassets_account,
                    query.rows.map((row) => this.transferFormatter(row)),
                    this.assetFormatter, this.assetView, this.fillerHook
                );

                return res.json({success: true, data: transfers, query_time: Date.now()});
            } catch (e) {
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
                                description: 'only transfers which contain this asset_id - separate multiple with ","',
                                required: false,
                                schema: {type: 'string'}
                            },
                            {
                                name: 'template_id',
                                in: 'query',
                                description: 'only transfers which contain assets of this template - separate multiple with ","',
                                required: false,
                                schema: {type: 'string'}
                            },
                            {
                                name: 'schema_name',
                                in: 'query',
                                description: 'only transfers which contain assets of this schema - separate multiple with ","',
                                required: false,
                                schema: {type: 'string'}
                            },
                            {
                                name: 'collection_name',
                                in: 'query',
                                description: 'only transfers which contain assets of this collection - separate multiple with ","',
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

    sockets(notification: ApiNotificationReceiver): void {
        const namespace = createSocketApiNamespace(this.server, this.core.path + '/v1/offers');

        notification.onData('transfers', async (notifications: NotificationData[]) => {
            const transferIDs = notifications.filter(row => row.type === 'trace').map(row => row.data.trace.global_sequence);
            const query = await this.server.query(
                'SELECT * FROM ' + this.transferView + ' WHERE contract = $1 AND transfer_id = ANY($2)',
                [this.core.args.atomicassets_account, transferIDs]
            );

            const transfers = await fillTransfers(
                this.server, this.core.args.atomicassets_account,
                query.rows.map((row) => this.transferFormatter(row)),
                this.assetFormatter, this.assetView, this.fillerHook
            );

            for (const notification of notifications) {
                if (notification.type === 'trace' && notification.data.trace) {
                    const trace = notification.data.trace;

                    if (trace.act.account !== this.core.args.atomicassets_account) {
                        continue;
                    }

                    if (trace.act.name === 'logtransfer') {
                        namespace.emit('new_transfer', {
                            transaction: notification.data.tx,
                            block: notification.data.block,
                            trace: trace,
                            transfer_id: trace.global_sequence,
                            transfer: transfers.find(row => String(row.transfer_id) === String(trace.global_sequence))
                        });
                    }
                } else if (notification.type === 'fork') {
                    namespace.emit('fork', {block_num: notification.data.block.block_num});
                }
            }
        });
    }
}
