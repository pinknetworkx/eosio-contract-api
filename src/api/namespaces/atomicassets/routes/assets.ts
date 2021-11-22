import * as express from 'express';

import { AtomicAssetsContext, AtomicAssetsNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { buildAssetFilter, buildGreylistFilter, buildHideOffersFilter } from '../utils';
import { filterQueryArgs, FilterValues, RequestValues } from '../../utils';
import {
    primaryBoundaryParameters,
    getOpenAPI3Responses,
    paginationParameters,
    dateBoundaryParameters,
    actionGreylistParameters
} from '../../../docs';
import {
    extendedAssetFilterParameters,
    atomicDataFilter,
    greylistFilterParameters,
    hideOffersParameters,
    baseAssetFilterParameters, completeAssetFilterParameters
} from '../openapi';
import { fillAssets, FillerHook } from '../filler';
import {
    createSocketApiNamespace,
    extractNotificationIdentifiers,
} from '../../../utils';
import ApiNotificationReceiver from '../../../notification';
import { NotificationData } from '../../../../filler/notifier';
import QueryBuilder from '../../../builder';
import { getRawAssetsAction, getAssetsCountAction, getAssetStatsAction, getAssetLogsAction } from './handlers/assets';
import { ApiError } from '../../../error';

export function buildAssetQueryCondition(
    values: FilterValues, query: QueryBuilder,
    options: {assetTable: string, templateTable?: string}
): void {
    const args = filterQueryArgs(values, {
        authorized_account: {type: 'string', min: 1, max: 12},
        hide_templates_by_accounts: {type: 'string', min: 1, max: 12},

        only_duplicate_templates: {type: 'bool'},
        has_backed_tokens: {type: 'bool'},

        template_mint: {type: 'int', min: 1},

        min_template_mint: {type: 'int', min: 1},
        max_template_mint: {type: 'int', min: 1},

        template_blacklist: {type: 'string', min: 1},
        template_whitelist: {type: 'string', min: 1}
    });

    if (args.authorized_account) {
        query.addCondition(
            'EXISTS(' +
            'SELECT * FROM atomicassets_collections collection ' +
            'WHERE collection.collection_name = ' + options.assetTable + '.collection_name AND collection.contract = ' + options.assetTable + '.contract ' +
            'AND ' + query.addVariable(args.authorized_account) + ' = ANY(collection.authorized_accounts)' +
            ')'
        );
    }

    if (args.hide_templates_by_accounts) {
        query.addCondition(
            'NOT EXISTS(' +
            'SELECT * FROM atomicassets_assets asset2 ' +
            'WHERE asset2.template_id = ' + options.assetTable + '.template_id AND asset2.contract = ' + options.assetTable + '.contract ' +
            'AND asset2.owner = ANY(' + query.addVariable(args.hide_templates_by_accounts.split(',')) + ')' +
            ')'
        );
    }

    if (args.only_duplicate_templates) {
        query.addCondition(
            'EXISTS (' +
            'SELECT * FROM atomicassets_assets inner_asset ' +
            'WHERE inner_asset.contract = asset.contract AND inner_asset.template_id = ' + options.assetTable + '.template_id ' +
            'AND inner_asset.asset_id < ' + options.assetTable + '.asset_id AND inner_asset.owner = ' + options.assetTable + '.owner' +
            ') AND ' + options.assetTable + '.template_id IS NOT NULL'
        );
    }

    if (typeof args.has_backed_tokens === 'boolean') {
        if (args.has_backed_tokens) {
            query.addCondition('EXISTS (' +
                'SELECT * FROM atomicassets_assets_backed_tokens token ' +
                'WHERE ' + options.assetTable + '.contract = token.contract AND ' + options.assetTable + '.asset_id = token.asset_id' +
                ')');
        } else {
            query.addCondition('NOT EXISTS (' +
                'SELECT * FROM atomicassets_assets_backed_tokens token ' +
                'WHERE ' + options.assetTable + '.contract = token.contract AND ' + options.assetTable + '.asset_id = token.asset_id' +
                ')');
        }
    }

    buildHideOffersFilter(values, query, options.assetTable);

    if (args.template_mint) {
        query.equal(options.assetTable + '.template_mint', args.template_mint);
    }

    if (args.min_template_mint) {
        let condition = options.assetTable + '.template_mint >= ' + query.addVariable(args.min_template_mint);

        if (args.min_template_mint <= 1) {
            condition += ' OR ' + options.assetTable + '.template_id IS NULL';
        }

        query.addCondition('(' + condition + ')');
    }

    if (args.max_template_mint) {
        let condition = options.assetTable + '.template_mint <= ' + query.addVariable(args.max_template_mint);

        if (args.max_template_mint >= 1) {
            condition += ' OR ' + options.assetTable + '.template_id IS NULL';
        }

        query.addCondition('(' + condition + ')');
    }

    buildAssetFilter(values, query, {assetTable: options.assetTable, templateTable: options.templateTable});
    buildGreylistFilter(values, query, {collectionName: options.assetTable + '.collection_name'});

    if (args.template_blacklist) {
        query.notMany(options.assetTable + '.template_id', args.template_blacklist.split(','));
    }

    if (args.template_whitelist) {
        query.equalMany(options.assetTable + '.template_id', args.template_whitelist.split(','));
    }
}

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
        const result = await getRawAssetsAction(params, ctx);
        return await fillAssets(
            this.server, this.core.args.atomicassets_account,
            result.rows.map((row: any) => row.asset_id),
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
            const query = await this.server.query(
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
