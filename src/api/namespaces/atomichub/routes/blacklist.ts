import * as express from 'express';

import { AtomicHubNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { filterQueryArgs } from '../../utils';
import { bearerToken } from '../../authentication/middleware';
import logger from '../../../../utils/winston';
import { getOpenAPI3Responses } from '../../../docs';

export function blacklistEndpoints(core: AtomicHubNamespace, server: HTTPServer, router: express.Router): any {
    router.put('/v1/blacklist', bearerToken(core.connection), async (req, res) => {
        try {
            const body = filterQueryArgs(req, {
                collection_name: {type: 'string', min: 1}
            }, 'body');

            if (!body.collection_name) {
                return res.status(500).json({success: false, message: 'Input missing'});
            }

            try {
                await core.connection.database.query(
                    'INSERT INTO atomichub_blacklist (account, contract, collection_name, created) VALUES ($1, $2, $3, $4)',
                    [req.authorizedAccount, core.args.atomicassets_account, body.collection_name, Date.now()]
                );

                return res.json({success: true, data: null});
            } catch (e) {
                return res.status(416).json({success: false, message: 'Entry already exists or collection_name not found'});
            }
        } catch (e) {
            logger.error(req.originalUrl + ' ', e);

            return res.status(500).json({success: false, message: 'Internal Server Error'});
        }

    });

    router.delete('/v1/blacklist/:collection_name', bearerToken(core.connection), async (req, res) => {
        try {
            const query = await core.connection.database.query(
                'DELETE FROM atomichub_blacklist WHERE account = $1 AND contract = $2 AND collection_name = $3 RETURNING *',
                [req.authorizedAccount, core.args.atomicassets_account, req.params.collection_name]
            );

            if (query.rowCount > 0) {
                return res.json({success: true, data: null});
            }

            return res.status(416).json({success: false, message: 'Item not found on user blacklist'});
        } catch (e) {
            logger.error(req.originalUrl + ' ', e);

            return res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    });

    router.get('/v1/blacklist/:account', server.web.caching(), async (req, res) => {
        try {
            const query = await core.connection.database.query(
                'SELECT collection_name FROM atomichub_blacklist WHERE account = $1',
                [req.params.account]
            );

            return res.json({success: true, data: query.rows.map(row => row.collection_name), query_time: Date.now()});
        } catch (e) {
            logger.error(req.originalUrl + ' ', e);

            return res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    });

    return {
        tag: {
            name: 'blacklist',
            description: 'Blacklist'
        },
        paths: {
            '/v1/blacklist/{account}': {
                get: {
                    tags: ['blacklist'],
                    summary: 'Get the user blacklist for a specific account',
                    parameters: [
                        {
                            in: 'path',
                            name: 'account',
                            required: false,
                            schema: {type: 'string'},
                            description: 'Account Name'
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 500], {
                        type: 'array',
                        items: {type: 'string'}
                    })
                }
            },
            '/v1/blacklist/{collection_name}': {
                delete: {
                    tags: ['blacklist'],
                    security: [
                        {bearerAuth: []}
                    ],
                    summary: 'Remove an collection from the user blacklist',
                    parameters: [
                        {
                            in: 'path',
                            name: 'collection_name',
                            required: true,
                            schema: {type: 'string'},
                            description: 'Collection Name which should be removed'
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 401, 500], {type: 'object', nullable: true})
                }
            },
            '/v1/blacklist': {
                put: {
                    tags: ['blacklist'],
                    security: [
                        {bearerAuth: []}
                    ],
                    summary: 'Add an collection to the user blacklist',
                    requestBody: {
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        collection_name: {type: 'string'}
                                    }
                                },
                                example: {
                                    collection_name: 'Collection Name'
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
