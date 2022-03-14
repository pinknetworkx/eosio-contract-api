import * as express from 'express';

import { AtomicAssetsContext, AtomicAssetsNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { RequestValues } from '../../utils';
import { FillerHook, fillOffers } from '../filler';
import {
    actionGreylistParameters,
    dateBoundaryParameters,
    getOpenAPI3Responses,
    paginationParameters,
    primaryBoundaryParameters
} from '../../../docs';
import { OfferState } from '../../../../filler/handlers/atomicassets';
import { greylistFilterParameters } from '../openapi';
import {
    createSocketApiNamespace,
    extractNotificationIdentifiers,
} from '../../../utils';
import ApiNotificationReceiver from '../../../notification';
import { NotificationData } from '../../../../filler/notifier';
import { getOfferLogsCountAction, getOffersCountAction, getRawOffersAction } from '../handlers/offers';
import { ApiError } from '../../../error';

export class OfferApi {
    constructor(
        readonly core: AtomicAssetsNamespace,
        readonly server: HTTPServer,
        readonly schema: string,
        readonly offerView: string,
        readonly offerFormatter: (_: any) => any,
        readonly assetView: string,
        readonly assetFormatter: (_: any) => any,
        readonly fillerHook?: FillerHook
    ) { }

    getOffersAction = async (params: RequestValues, ctx: AtomicAssetsContext): Promise<any> => {
        const offerResult = await getRawOffersAction(params, ctx);

        const offerLookup: {[key: string]: any} = {};
        const result = await ctx.db.query(
            'SELECT * FROM ' + this.offerView + ' WHERE contract = $1 AND offer_id = ANY ($2)',
            [ctx.coreArgs.atomicassets_account, offerResult.rows.map((row: any) => row.offer_id)]
        );

        result.rows.reduce((prev, current) => {
            prev[String(current.offer_id)] = current;

            return prev;
        }, offerLookup);

        return await fillOffers(
            this.server, this.core.args.atomicassets_account,
            offerResult.rows.map((row: any) => this.offerFormatter(offerLookup[row.offer_id])),
            this.assetFormatter, this.assetView, this.fillerHook
        );
    }

    getOfferAction = async (params: RequestValues, ctx: AtomicAssetsContext): Promise<any> => {
        const query = await this.server.query(
            'SELECT * FROM atomicassets_offers_master WHERE contract = $1 AND offer_id = $2',
            [ctx.coreArgs.atomicassets_account, ctx.pathParams.offer_id]
        );

        if (query.rowCount === 0) {
            throw new ApiError('Offer not found', 416);
        }

        const offers = await fillOffers(
            ctx.db, ctx.coreArgs.atomicassets_account,
            query.rows.map((row) => this.offerFormatter(row)),
            this.assetFormatter, this.assetView, this.fillerHook
        );

        return offers[0];
    }

    endpoints(router: express.Router): any {
        const {caching, returnAsJSON} = this.server.web;

        router.all('/v1/offers', caching(), returnAsJSON(this.getOffersAction, this.core));
        router.all('/v1/offers/_count', caching(), returnAsJSON(getOffersCountAction, this.core));

        router.all('/v1/offers/:offer_id', caching({ignoreQueryString: true}), returnAsJSON(this.getOfferAction, this.core));

        router.all('/v1/offers/:offer_id/logs', caching(), returnAsJSON(getOfferLogsCountAction, this.core));

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
                                description: 'only offers which contain this asset_id - separate multiple with ","',
                                required: false,
                                schema: {type: 'string'}
                            },
                            {
                                name: 'template_id',
                                in: 'query',
                                description: 'only offers which contain assets of this template - separate multiple with ","',
                                required: false,
                                schema: {type: 'string'}
                            },
                            {
                                name: 'schema_name',
                                in: 'query',
                                description: 'only offers which contain assets of this schema - separate multiple with ","',
                                required: false,
                                schema: {type: 'string'}
                            },
                            {
                                name: 'collection_name',
                                in: 'query',
                                description: 'only offers which contain assets of this collection - separate multiple with ","',
                                required: false,
                                schema: {type: 'string'}
                            },
                            {
                                name: 'account_whitelist',
                                in: 'query',
                                description: 'Only offers which are sent by one of these accounts',
                                required: false,
                                schema: {type: 'string'}
                            },
                            {
                                name: 'account_blacklist',
                                in: 'query',
                                description: 'Exclude offers which are sent by one of these accounts',
                                required: false,
                                schema: {type: 'string'}
                            },
                            {
                                name: 'sender_asset_whitelist',
                                in: 'query',
                                description: 'Only offers which contain these assets',
                                required: false,
                                schema: {type: 'string'}
                            },
                            {
                                name: 'sender_asset_blacklist',
                                in: 'query',
                                description: 'Exclude offers which contain these assets',
                                required: false,
                                schema: {type: 'string'}
                            },
                            {
                                name: 'recipient_asset_whitelist',
                                in: 'query',
                                description: 'Only offers which contain these assets',
                                required: false,
                                schema: {type: 'string'}
                            },
                            {
                                name: 'recipient_asset_blacklist',
                                in: 'query',
                                description: 'Exclude offers which contain these assets',
                                required: false,
                                schema: {type: 'string'}
                            },
                            {
                                name: 'hide_contracts',
                                in: 'query',
                                description: 'dont show offers from or to accounts that have code deployed',
                                required: false,
                                schema: {type: 'boolean'}
                            },
                            {
                                name: 'hide_empty_offers',
                                in: 'query',
                                description: 'dont show offers where one side is empty',
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
        const namespace = createSocketApiNamespace(this.server, this.core.path + '/v1/offers');

        notification.onData('offers', async (notifications: NotificationData[]) => {
            const offerIDs = extractNotificationIdentifiers(notifications, 'offer_id');
            const query = await this.server.database.query(
                'SELECT * FROM ' + this.offerView + ' WHERE contract = $1 AND offer_id = ANY($2)',
                [this.core.args.atomicassets_account, offerIDs]
            );

            const offers = await fillOffers(
                this.server, this.core.args.atomicassets_account,
                query.rows.map((row) => this.offerFormatter(row)),
                this.assetFormatter, this.assetView, this.fillerHook
            );

            for (const notification of notifications) {
                if (notification.type === 'trace' && notification.data.trace) {
                    const trace = notification.data.trace;

                    if (trace.act.account !== this.core.args.atomicassets_account) {
                        continue;
                    }

                    const offerID = (<any>trace.act.data).offer_id;

                    if (trace.act.name === 'lognewoffer') {
                        namespace.emit('create', {
                            transaction: notification.data.tx,
                            block: notification.data.block,
                            trace: trace,
                            offer_id: offerID,
                            offer: offers.find(row => String(row.offer_id) === String(offerID)),
                        });
                    }
                } else if (notification.type === 'fork') {
                    namespace.emit('fork', {block_num: notification.data.block.block_num});
                }
            }
        });
    }
}
