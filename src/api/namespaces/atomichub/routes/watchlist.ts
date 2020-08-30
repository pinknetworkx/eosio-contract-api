import * as express from 'express';

import { AtomicHubNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { filterQueryArgs } from '../../utils';
import { bearerToken } from '../../authentication/middleware';
import logger from '../../../../utils/winston';
import { getOpenAPI3Responses, paginationParameters } from '../../../docs';
import { assetFilterParameters, greylistFilterParameters } from '../../atomicassets/openapi';
import { buildAssetFilter } from '../../atomicassets/utils';
import { fillAssets } from '../../atomicassets/filler';
import { formatListingAsset } from '../../atomicmarket/format';

export function watchlistEndpoints(core: AtomicHubNamespace, server: HTTPServer, router: express.Router): any {
    router.put('/v1/watchlist', bearerToken(core.connection), async (req, res) => {
        try {
            const body = filterQueryArgs(req, {
                asset_id: {type: 'int', min: 1}
            }, 'body');

            if (!body.asset_id) {
                return res.status(500).json({success: false, message: 'Input missing'});
            }

            try {
                await server.query(
                    'INSERT INTO atomichub_watchlist (account, contract, asset_id, created) VALUES ($1, $2, $3, $4)',
                    [req.authorizedAccount, core.args.atomicassets_account, body.asset_id, Date.now()]
                );

                return res.json({success: true, data: null});
            } catch (e) {
                return res.json({success: false, message: 'Entry already exists or asset id not found'});
            }
        } catch (e) {
            return res.status(500).json({success: false, message: 'Internal Server Error'});
        }

    });

    router.delete('/v1/watchlist/:asset_id', bearerToken(core.connection), async (req, res) => {
        try {
            const query = await server.query(
                'DELETE FROM atomichub_watchlist WHERE account = $1 AND contract = $2 AND asset_id = $3 RETURNING *',
                [req.authorizedAccount, core.args.atomicassets_account, req.params.asset_id]
            );

            if (query.rowCount > 0) {
                return res.json({success: true, data: null});
            }

            return res.json({success: false, message: 'Item not found on watchlist'});
        } catch (e) {
            return res.json({success: false, message: 'Internal Server Error'});
        }
    });

    router.get('/v1/watchlist/:account', server.web.caching(), async (req, res) => {
        try {
            const args = filterQueryArgs(req, {
                page: {type: 'int', min: 1, default: 1},
                limit: {type: 'int', min: 1, max: 1000, default: 100},
                sort: {type: 'string', values: ['added', 'asset_id'], default: 'added'},
                order: {type: 'string', values: ['asc', 'desc'], default: 'desc'},

                collection_whitelist: {type: 'string', min: 1},
                collection_blacklist: {type: 'string', min: 1}
            });

            let varCounter = 2;
            let queryString = 'SELECT asset.asset_id ' +
                'FROM atomicassets_assets asset JOIN atomichub_watchlist wlist ON (' +
                    'wlist.contract = asset.contract AND wlist.asset_id = asset.asset_id' +
                ') LEFT JOIN atomicassets_templates "template" ON (' +
                    'asset.contract = template.contract AND asset.template_id = template.template_id' +
                ') ' +
                'WHERE asset.contract = $1 AND wlist.account = $2 ';

            let queryValues: any[] = [core.args.atomicassets_account, req.params.account];

            const filter = buildAssetFilter(req, varCounter, '"asset"', '"template"');

            queryValues = queryValues.concat(filter.values);
            varCounter += filter.values.length;
            queryString += filter.str;

            const sortColumnMapping = {
                asset_id: 'asset.asset_id',
                added: 'wlist.created'
            };

            if (args.collection_whitelist) {
                queryString += 'AND asset.collection_name = ANY ($' + ++varCounter + ') ';
                queryValues.push(args.collection_whitelist.split(','));
            }

            if (args.collection_blacklist) {
                queryString += 'AND NOT (asset.collection_name = ANY ($' + ++varCounter + ')) ';
                queryValues.push(args.collection_blacklist.split(','));
            }

            // @ts-ignore
            queryString += 'ORDER BY ' + sortColumnMapping[args.sort] + ' ' + args.order + ', asset.asset_id ASC ';
            queryString += 'LIMIT $' + ++varCounter + ' OFFSET $' + ++varCounter + ' ';
            queryValues.push(args.limit);
            queryValues.push((args.page - 1) * args.limit);

            const query = await server.query(queryString, queryValues);

            const assets = await fillAssets(
                server, core.args.atomicassets_account,
                query.rows.map(row => row.asset_id),
                formatListingAsset, 'atomicmarket_assets_master'
            );

            return res.json({success: true, data: assets, query_time: Date.now()});
        } catch (e) {
            return res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    });

    router.get('/v1/watchlist/:account/:asset_id', server.web.caching(), async (req, res) => {
        try {
            const query = await server.query(
                'SELECT asset_id FROM atomichub_watchlist WHERE contract = $1 AND account = $2 AND asset_id = $3',
                [core.args.atomicassets_account, req.params.account, req.params.asset_id]
            );

            return res.json({success: query.rowCount > 0, data: null, query_time: Date.now()});
        } catch (e) {
            return res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    });

    return {
        tag: {
            name: 'watchlist',
            description: 'Watchlist'
        },
        paths: {
            '/v1/watchlist/{account}': {
                get: {
                    tags: ['watchlist'],
                    summary: 'Get the watchlist from a specific account',
                    parameters: [
                        ...assetFilterParameters,
                        ...greylistFilterParameters,
                        ...paginationParameters,
                        {
                            in: 'query',
                            name: 'sort',
                            required: false,
                            schema: {type: 'string', enum: ['asset_id', 'added']},
                            description: 'Field which is used to sort'
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 500], {
                        type: 'array',
                        items: {'$ref': '#/components/schemas/ListingAsset'}
                    })
                }
            },
            '/v1/watchlist/{asset_id}': {
                delete: {
                    tags: ['watchlist'],
                    security: [
                        {bearerAuth: []}
                    ],
                    summary: 'Remove an asset from the watchlist',
                    parameters: [
                        {
                            in: 'path',
                            name: 'asset_id',
                            required: true,
                            schema: {type: 'string'},
                            description: 'Asset id which should be removed'
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 401, 500], {type: 'object', nullable: true})
                }
            },
            '/v1/watchlist': {
                put: {
                    tags: ['watchlist'],
                    security: [
                        {bearerAuth: []}
                    ],
                    summary: 'Add an asset to the watchlist',
                    requestBody: {
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        asset_id: {type: 'number'}
                                    }
                                },
                                example: {
                                    asset_id: 'Asset ID'
                                }
                            }
                        }
                    },
                    responses: getOpenAPI3Responses([200, 401, 500], {type: 'object', nullable: true})
                }
            }
        }
    };
}
