import * as express from 'express';

import { AtomicAssetsContext, AtomicAssetsNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { RequestValues } from '../../utils';
import {
    actionGreylistParameters,
    dateBoundaryParameters,
    getOpenAPI3Responses,
    paginationParameters,
    primaryBoundaryParameters
} from '../../../docs';
import {
    atomicDataFilter,
    baseAssetFilterParameters,
    completeAssetFilterParameters,
    extendedAssetFilterParameters,
    greylistFilterParameters,
    hideOffersParameters
} from '../openapi';
import { fillAssets, FillerHook } from '../filler';
import { createSocketApiNamespace, extractNotificationIdentifiers, } from '../../../utils';
import ApiNotificationReceiver from '../../../notification';
import { NotificationData } from '../../../../filler/notifier';
import { getAssetLogsAction, getAssetsCountAction, getAssetStatsAction, getRawAssetsAction } from '../handlers/assets';
import { ApiError } from '../../../error';

export class AssetApi {
    constructor(
        readonly core: AtomicAssetsNamespace,
        readonly server: HTTPServer,
        readonly schema: string,
        readonly assetView: string,
        readonly assetFormatter: (_: any) => any,
        readonly fillerHook?: FillerHook
    ) { }

    getAssetsAction = async (params: RequestValues, ctx: AtomicAssetsContext): Promise<any> => {
        const assetIDs = await getRawAssetsAction(params, ctx) as Array<number>;
        return await fillAssets(
            this.server, this.core.args.atomicassets_account,
            assetIDs,
            this.assetFormatter, this.assetView, this.fillerHook
        );
    };

    multipleAssetEndpoints(router: express.Router): any {
        const {caching, returnAsJSON} = this.server.web;

        router.all('/v1/assets', caching(), returnAsJSON(this.getAssetsAction, this.core));
        router.all('/v1/assets/_count', caching(), returnAsJSON(getAssetsCountAction, this.core));

        return {
            tag: {
                name: 'assets',
                description: 'Assets'
            },
            paths: {
                '/v1/assets': {
                    get: {
                        tags: ['assets'],
                        summary: 'Fetch assets.',
                        description: atomicDataFilter,
                        parameters: [
                            ...baseAssetFilterParameters,
                            ...extendedAssetFilterParameters,
                            ...completeAssetFilterParameters,
                            ...hideOffersParameters,
                            ...greylistFilterParameters,
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
                                    enum: ['asset_id', 'minted', 'updated', 'transferred', 'template_mint', 'name'],
                                    default: 'asset_id'
                                }
                            }
                        ],
                        responses: getOpenAPI3Responses([200, 500], {type: 'array', items: {'$ref': '#/components/schemas/' + this.schema}})
                    }
                }
            }
        };
    }

    getAssetAction = async (params: RequestValues, ctx: AtomicAssetsContext): Promise<any> => {
        const assets = await fillAssets(
            ctx.db, ctx.coreArgs.atomicassets_account,
            [ctx.pathParams.asset_id],
            this.assetFormatter, this.assetView, this.fillerHook
        );

        if (assets.length === 0 || typeof assets[0] === 'string') {
            throw new ApiError('Asset not found', 416);
        }

        return assets[0];
    }

    singleAssetEndpoints(router: express.Router): any {
        const {caching, returnAsJSON} = this.server.web;

        router.all('/v1/assets/:asset_id', caching({ignoreQueryString: true}), returnAsJSON(this.getAssetAction, this.core));

        router.all('/v1/assets/:asset_id/stats', caching({ignoreQueryString: true}), returnAsJSON(getAssetStatsAction, this.core));

        router.all('/v1/assets/:asset_id/logs', caching(), returnAsJSON(getAssetLogsAction, this.core));

        return {
            tag: {
                name: 'assets',
                description: 'Assets'
            },
            paths: {
                '/v1/assets/{asset_id}': {
                    get: {
                        tags: ['assets'],
                        summary: 'Fetch asset by id',
                        parameters: [
                            {
                                name: 'asset_id',
                                in: 'path',
                                description: 'ID of asset',
                                required: true,
                                schema: {type: 'string'}
                            }
                        ],
                        responses: getOpenAPI3Responses([200, 416, 500], {'$ref': '#/components/schemas/' + this.schema})
                    }
                },
                '/v1/assets/{asset_id}/stats': {
                    get: {
                        tags: ['assets'],
                        summary: 'Fetch asset stats',
                        parameters: [
                            {
                                name: 'asset_id',
                                in: 'path',
                                description: 'ID of asset',
                                required: true,
                                schema: {type: 'integer'}
                            }
                        ],
                        responses: getOpenAPI3Responses([200, 500], {
                            type: 'object',
                            properties: {
                                template_mint: {type: 'integer'}
                            }
                        })
                    }
                },
                '/v1/assets/{asset_id}/logs': {
                    get: {
                        tags: ['assets'],
                        summary: 'Fetch asset logs',
                        parameters: [
                            {
                                name: 'asset_id',
                                in: 'path',
                                description: 'ID of asset',
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

    sockets(notification: ApiNotificationReceiver): void {
        const namespace = createSocketApiNamespace(this.server, this.core.path + '/v1/assets');

        notification.onData('assets', async (notifications: NotificationData[]) => {
            const assetIDs = extractNotificationIdentifiers(notifications, 'asset_id');
            const query = await this.server.database.query(
                'SELECT * FROM ' + this.assetView + ' WHERE contract = $1 AND asset_id = ANY($2)',
                [this.core.args.atomicassets_account, assetIDs]
            );
            const assets = query.rows.map(row => this.assetFormatter(row));

            for (const notification of notifications) {
                if (notification.type === 'trace' && notification.data.trace) {
                    const trace = notification.data.trace;

                    if (trace.act.account !== this.core.args.atomicassets_account) {
                        continue;
                    }

                    const assetID = (<any>trace.act.data).asset_id;

                    if (trace.act.name === 'logmint') {
                        namespace.emit('new_asset', {
                            transaction: notification.data.tx,
                            block: notification.data.block,
                            trace: trace,
                            asset_id: assetID,
                            asset: assets.find(row => String(row.asset_id) === String(assetID))
                        });
                    } else if (trace.act.name === 'logburnasset') {
                        namespace.emit('burn', {
                            transaction:notification.data.tx,
                            block: notification.data.block,
                            trace: trace,
                            asset_id: assetID,
                            asset: assets.find(row => String(row.asset_id) === String(assetID))
                        });
                    }

                    if (this.core.args.socket_features.asset_update) {
                        if (trace.act.name === 'logbackasset') {
                            namespace.emit('back', {
                                transaction: notification.data.tx,
                                block: notification.data.block,
                                trace: trace,
                                asset_id: assetID,
                                asset: assets.find(row => String(row.asset_id) === String(assetID))
                            });
                        } else if (trace.act.name === 'logsetdata') {
                            namespace.emit('update', {
                                transaction: notification.data.tx,
                                block: notification.data.block,
                                trace: trace,
                                asset_id: assetID,
                                asset: assets.find(row => String(row.asset_id) === String(assetID))
                            });
                        }
                    }
                } else if (notification.type === 'fork') {
                    namespace.emit('fork', {block_num: notification.data.block.block_num});
                }
            }
        });
    }
}
