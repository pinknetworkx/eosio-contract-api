import * as express from 'express';

import { AtomicAssetsNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { filterQueryArgs } from '../../utils';
import { getLogs } from '../utils';
import logger from '../../../../utils/winston';
import { formatCollection } from '../format';
import { paginationFilter, standardArrayFilter } from '../swagger';

export function collectionsEndpoints(core: AtomicAssetsNamespace, server: HTTPServer, router: express.Router): any {
    router.get('/v1/collections', server.web.caching({ contentType: 'text/json' }), (async (req, res) => {
        try {
            const args = filterQueryArgs(req, {
                page: {type: 'int', min: 1, default: 1},
                limit: {type: 'int', min: 1, max: 100, default: 100},
                sort: {type: 'string', values: ['created'], default: 'created'},
                order: {type: 'string', values: ['asc', 'desc'], default: 'desc'},

                author: {type: 'string', min: 1, max: 12},
                authorized_account: {type: 'string', min: 1, max: 12},
                notify_account: {type: 'string', min: 1, max: 12},

                match: {type: 'string', min: 1}
            });

            let varCounter = 1;
            let queryString = 'SELECT * FROM atomicassets_collections_master WHERE contract = $1 ';

            const queryValues: any[] = [core.args.atomicassets_account];

            if (args.author) {
                queryString += 'AND author = $' + ++varCounter + ' ';
                queryValues.push(args.author);
            }

            if (args.authorized_account) {
                queryString += 'AND $' + ++varCounter + ' = ANY(authorized_accounts) ';
                queryValues.push(args.authorized_account);
            }

            if (args.notify_account) {
                queryString += 'AND $' + ++varCounter + ' = ANY(notify_accounts) ';
                queryValues.push(args.notify_account);
            }

            if (args.match) {
                queryString += 'AND (name LIKE $' + ++varCounter + ' OR collection_name LIKE $' + varCounter + ')';
                queryValues.push('%' + args.match + '%');
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

            return res.json({success: true, data: query.rows.map((row) => formatCollection(row))});
        } catch (e) {
            logger.error(e);

            res.status(500);
            res.json({success: false, message: 'Internal Server Error'});
        }
    }));

    router.get('/v1/collections/:collection_name', server.web.caching({ contentType: 'text/json' }), (async (req, res) => {
        try {
            const query = await core.connection.database.query(
                'SELECT * FROM atomicassets_collections_master WHERE contract = $1 AND collection_name = $2',
                [core.args.atomicassets_account, req.params.collection_name]
            );

            if (query.rowCount === 0) {
                res.status(500);

                return res.json({success: false, message: 'Collection not found'});
            }

            return res.json({success: true, data: formatCollection(query.rows[0])});
        } catch (e) {
            logger.error(e);

            res.status(500);
            return res.json({success: false, message: 'Internal Server Error'});
        }
    }));

    router.get('/v1/collections/:collection_name/logs', server.web.caching({ contentType: 'text/json' }), (async (req, res) => {
        const args = filterQueryArgs(req, {
            page: {type: 'int', min: 1, default: 1},
            limit: {type: 'int', min: 1, max: 100, default: 100}
        });

        try {
            res.json({
                success: true,
                data: await getLogs(
                    core.connection.database, core.args.atomicassets_account, 'collection', req.params.collection_name,
                    (args.page - 1) * args.limit, args.limit
                )
            });
        } catch (e) {
            logger.error(e);

            res.status(500);
            return res.json({success: false, message: 'Internal Server Error'});
        }
    }));

    return {
        tag: {
            name: 'collections',
            description: 'Collections'
        },
        paths: {
            '/v1/collections': {
                get: {
                    tags: ['collections'],
                    summary: 'Fetch collections',
                    produces: ['application/json'],
                    parameters: [
                        {
                            name: 'author',
                            in: 'query',
                            description: 'Get collections by author',
                            required: false,
                            type: 'string'
                        },
                        {
                            name: 'match',
                            in: 'query',
                            description: 'Search for input in collection name',
                            required: false,
                            type: 'string'
                        },
                        {
                            name: 'authorized_account',
                            in: 'query',
                            description: 'Filter for collections which the provided account can use to create assets',
                            required: false,
                            type: 'string'
                        },
                        {
                            name: 'notify_account',
                            in: 'query',
                            description: 'Filter for collections where the provided account is notified',
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
                                    data: {type: 'array', items: {'$ref': '#/definitions/Collection'}}
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
            },
            '/v1/collections/{collection_name}': {
                get: {
                    tags: ['collections'],
                    summary: 'Find collection by its name',
                    produces: ['application/json'],
                    parameters: [
                        {
                            name: 'collection_name',
                            in: 'path',
                            description: 'Name of collection',
                            required: true,
                            type: 'string'
                        }
                    ],
                    responses: {
                        '200': {
                            description: 'OK',
                            schema: {
                                type: 'object',
                                properties: {
                                    success: {type: 'boolean', default: true},
                                    data: {'$ref': '#/definitions/Collection'}
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
            },
            '/v1/collections/{collection_name}/logs': {
                get: {
                    tags: ['collections'],
                    summary: 'Fetch collection logs',
                    produces: ['application/json'],
                    parameters: [
                        {
                            name: 'collection_name',
                            in: 'path',
                            description: 'Name of collection',
                            required: true,
                            type: 'string'
                        },
                        ...paginationFilter
                    ],
                    responses: {
                        '200': {
                            description: 'OK',
                            schema: {
                                type: 'object',
                                properties: {
                                    success: {type: 'boolean', default: true},
                                    data: {'$ref': '#/definitions/Log'}
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
