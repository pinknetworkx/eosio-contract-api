import * as express from 'express';

import { AtomicHubNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { filterQueryArgs } from '../../utils';
import { bearerToken } from '../../authentication/middleware';
import logger from '../../../../utils/winston';
import { formatAsset } from '../../atomicassets/format';
import { getOpenAPI3Responses } from '../../../openapi';

export function watchlistEndpoints(core: AtomicHubNamespace, server: HTTPServer, router: express.Router): any {
    router.put('/v1/watchlist', bearerToken(core.connection), async (req, res) => {
        const body = filterQueryArgs(req, {
            asset_id: {type: 'int', min: 1}
        }, 'body');

        if (!body.asset_id) {
            return res.status(500).json({success: false, message: 'Input missing'});
        }

        try {
            await core.connection.database.query(
                'INSERT INTO atomichub_watchlist (account, contract, asset_id, created) VALUES ($1, $2, $3, $4)',
                [req.authorizedAccount, core.args.atomicassets_account, body.asset_id, Date.now()]
            );

            return res.json({success: true, data: null});
        } catch (e) {
            return res.json({success: false, message: 'Entry already exists or asset id not found'});
        }
    });

    router.delete('/v1/watchlist', bearerToken(core.connection), async (req, res) => {
        const body = filterQueryArgs(req, {
            asset_id: {type: 'int', min: 1}
        }, 'body');

        if (!body.asset_id) {
            return res.status(500).json({success: false, message: 'Input missing'});
        }

        try {
            const query = await core.connection.database.query(
                'DELETE FROM atomichub_watchlist WHERE account = $1 AND contract = $2 AND asset_id = $3 RETURNING *',
                [req.authorizedAccount, core.args.atomicassets_account, body.asset_id]
            );

            if (query.rowCount > 0) {
                return res.json({success: true, data: null});
            }

            return res.json({success: false, message: 'Item not found on watchlist'});
        } catch (e) {
            return res.json({success: false, message: 'Unknown error'});
        }
    });

    router.get('/v1/watchlist/:account', server.web.caching(), async (req, res) => {
        const args = filterQueryArgs(req, {
            page: {type: 'int', min: 1, default: 1},
            limit: {type: 'int', min: 1, max: 1000, default: 100},
            sort: {type: 'string', values: ['added', 'asset_id'], default: 'added'},
            order: {type: 'string', values: ['asc', 'desc'], default: 'desc'},

            template_id: {type: 'int', min: 0},
            collection_name: {type: 'string', min: 1, max: 12},
            schema_name: {type: 'string', min: 1, max: 12},
            match: {type: 'string', min: 1}
        });

        let varCounter = 2;
        let queryString = 'SELECT asset.* ' +
            'FROM atomicassets_assets_master asset JOIN atomichub_watchlist wlist ON (' +
                'wlist.contract = asset.contract AND wlist.asset_id = asset.asset_id' +
            ')' +
            'WHERE asset.contract = $1 AND wlist.account = $2 ';

        const queryValues: any[] = [core.args.atomicassets_account, req.params.account];

        if (args.template_id) {
            queryString += 'AND asset.template_id = $' + ++varCounter + ' ';
            queryValues.push(args.template_id);
        }

        if (args.collection_name) {
            queryString += 'AND asset.collection_name = $' + ++varCounter + ' ';
            queryValues.push(args.collection_name);
        }

        if (args.schema_name) {
            queryString += 'AND asset.schema_name = $' + ++varCounter + ' ';
            queryValues.push(args.schema_name);
        }

        if (args.match) {
            queryString += 'AND asset.name LIKE $' + ++varCounter + ' ';
            queryValues.push('%' + args.match + '%');
        }

        const sortColumnMapping = {
            asset_id: 'asset.asset_id',
            added: 'wlist.created'
        };

        // @ts-ignore
        queryString += 'ORDER BY ' + sortColumnMapping[args.sort] + ' ' + args.order + ' ';
        queryString += 'LIMIT $' + ++varCounter + ' OFFSET $' + ++varCounter + ' ';
        queryValues.push(args.limit);
        queryValues.push((args.page - 1) * args.limit);

        logger.debug(queryString);

        const query = await core.connection.database.query(queryString, queryValues);

        return res.json({success: true, data: query.rows.map((row) => formatAsset(row)), query_time: Date.now()});
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
                        {
                            in: 'path',
                            name: 'account',
                            required: true,
                            schema: {type: 'string'},
                            description: 'Owner of the watchlist'
                        },
                        {
                            in: 'query',
                            name: 'collection_name',
                            required: true,
                            schema: {type: 'string'},
                            description: 'Filter by the collection'
                        },
                        {
                            in: 'query',
                            name: 'schema_name',
                            required: true,
                            schema: {type: 'string'},
                            description: 'Filter by the schema'
                        },
                        {
                            in: 'query',
                            name: 'template_id',
                            required: true,
                            schema: {type: 'number'},
                            description: 'Filter by the template'
                        },
                        {
                            in: 'query',
                            name: 'match',
                            required: true,
                            schema: {type: 'string'},
                            description: 'Search for a string in the asset name'
                        },
                        {
                            in: 'query',
                            name: 'sort',
                            required: true,
                            schema: {type: 'string', enum: ['asset_id', 'added']},
                            description: 'Field which is used to sort'
                        },
                        {
                            in: 'query',
                            name: 'order',
                            required: true,
                            schema: {type: 'string', enum: ['desc', 'asc']},
                            description: 'Sort direction'
                        },
                        {
                            in: 'query',
                            name: 'limit',
                            required: true,
                            schema: {type: 'number'},
                            description: 'Number of results'
                        },
                        {
                            in: 'query',
                            name: 'page',
                            required: true,
                            schema: {type: 'number'},
                            description: 'Used for pagination'
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 500], {
                        type: 'array',
                        items: {
                            type: 'object'
                        }
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
