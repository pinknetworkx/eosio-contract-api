import * as express from 'express';

import { AtomicAssetsContext, AtomicAssetsNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { RequestValues } from '../../utils';
import { FillerHook, fillTransfers } from '../filler';
import {
    dateBoundaryParameters,
    getOpenAPI3Responses,
    paginationParameters,
    primaryBoundaryParameters
} from '../../../docs';
import { greylistFilterParameters } from '../openapi';
import ApiNotificationReceiver from '../../../notification';
import { createSocketApiNamespace } from '../../../utils';
import { NotificationData } from '../../../../filler/notifier';
import { getRawTransfersAction, getTransfersCountAction } from '../handlers/transfers';

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

    getTransfersAction = async (params: RequestValues, ctx: AtomicAssetsContext): Promise<any> => {
        const result = await getRawTransfersAction(params, ctx);

        return await fillTransfers(
            this.server, this.core.args.atomicassets_account,
            result.rows.map(this.transferFormatter),
            this.assetFormatter, this.assetView, this.fillerHook
        );
    }

    endpoints(router: express.Router): any {
        const {caching, returnAsJSON} = this.server.web;

        router.all('/v1/transfers', caching(), returnAsJSON(this.getTransfersAction, this.core));
        router.all('/v1/transfers/_count', caching(), returnAsJSON(getTransfersCountAction, this.core));

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
                                name: 'memo',
                                in: 'query',
                                description: 'Search for exact memo',
                                required: false,
                                schema: {type: 'string'}
                            },
                            {
                                name: 'match_memo',
                                in: 'query',
                                description: 'Search for text in memo',
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
                            {
                                name: 'hide_contracts',
                                in: 'query',
                                description: 'dont show transfers from or to accounts that have code deployed',
                                required: false,
                                schema: {type: 'boolean'}
                            },
                            ...primaryBoundaryParameters,
                            ...dateBoundaryParameters,
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
            const query = await this.server.database.query(
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
