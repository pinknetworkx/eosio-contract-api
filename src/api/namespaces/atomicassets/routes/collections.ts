import * as express from 'express';

import { AtomicAssetsNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { filterQueryArgs } from '../../utils';
import { getLogs } from '../utils';
import logger from '../../../../utils/winston';
import { formatCollection } from '../format';
import { getOpenAPI3Responses, paginationParameters } from '../../../docs';

export function collectionsEndpoints(core: AtomicAssetsNamespace, server: HTTPServer, router: express.Router): any {
    router.get('/v1/collections', server.web.caching(), (async (req, res) => {
        try {
            const args = filterQueryArgs(req, {
                page: {type: 'int', min: 1, default: 1},
                limit: {type: 'int', min: 1, max: 100, default: 100},
                sort: {type: 'string', values: ['created', 'collection_name'], default: 'created'},
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
                queryString += 'AND collection_name LIKE $' + ++varCounter + ' ';
                queryValues.push('%' + args.match + '%');
            }

            const sortColumnMapping = {
                created: 'created_at_block',
                collection_name: 'collection_name'
            };

            // @ts-ignore
            queryString += 'ORDER BY ' + sortColumnMapping[args.sort] + ' ' + args.order + ' ';
            queryString += 'LIMIT $' + ++varCounter + ' OFFSET $' + ++varCounter + ' ';
            queryValues.push(args.limit);
            queryValues.push((args.page - 1) * args.limit);

            logger.debug(queryString);

            const query = await core.connection.database.query(queryString, queryValues);

            return res.json({success: true, data: query.rows.map((row) => formatCollection(row)), query_time: Date.now()});
        } catch (e) {
            logger.error(req.originalUrl + ' ', e);

            res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    }));

    router.get('/v1/collections/:collection_name', server.web.caching({ignoreQueryString: true}), (async (req, res) => {
        try {
            const query = await core.connection.database.query(
                'SELECT * FROM atomicassets_collections_master WHERE contract = $1 AND collection_name = $2',
                [core.args.atomicassets_account, req.params.collection_name]
            );

            if (query.rowCount === 0) {
                return res.status(416).json({success: false, message: 'Collection not found'});
            }

            return res.json({success: true, data: formatCollection(query.rows[0]), query_time: Date.now()});
        } catch (e) {
            logger.error(req.originalUrl + ' ', e);

            return res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    }));

    router.get('/v1/collections/:collection_name/stats', server.web.caching({ignoreQueryString: true}), (async (req, res) => {
        try {
            const query = await core.connection.database.query(
                'SELECT ' +
                '(SELECT COUNT(*) FROM atomicassets_assets WHERE contract = $1 AND collection_name = $2) assets, ' +
                '(SELECT COUNT(*) FROM atomicassets_assets WHERE contract = $1 AND collection_name = $2 AND owner IS NULL) burned, ' +
                '(SELECT COUNT(*) FROM atomicassets_templates WHERE contract = $1 AND collection_name = $2) templates, ' +
                '(SELECT COUNT(*) FROM atomicassets_schemas WHERE contract = $1 AND collection_name = $2) "schemas"',
                [core.args.atomicassets_account, req.params.collection_name]
            );

            return res.json({success: true, data: query.rows[0]});
        } catch (e) {
            logger.error(req.originalUrl + ' ', e);

            res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    }));

    router.get('/v1/collections/:collection_name/logs', server.web.caching(), (async (req, res) => {
        const args = filterQueryArgs(req, {
            page: {type: 'int', min: 1, default: 1},
            limit: {type: 'int', min: 1, max: 100, default: 100},
            order: {type: 'string', values: ['asc', 'desc'], default: 'asc'}
        });

        try {
            res.json({
                success: true,
                data: await getLogs(
                    core.connection.database, core.args.atomicassets_account, 'collection', req.params.collection_name,
                    (args.page - 1) * args.limit, args.limit, args.order
                ), query_time: Date.now()
            });
        } catch (e) {
            logger.error(req.originalUrl + ' ', e);

            return res.status(500).json({success: false, message: 'Internal Server Error'});
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
                    parameters: [
                        {
                            name: 'author',
                            in: 'query',
                            description: 'Get collections by author',
                            required: false,
                            schema: {type: 'string'}
                        },
                        {
                            name: 'match',
                            in: 'query',
                            description: 'Search for input in collection name',
                            required: false,
                            schema: {type: 'string'}
                        },
                        {
                            name: 'authorized_account',
                            in: 'query',
                            description: 'Filter for collections which the provided account can use to create assets',
                            required: false,
                            schema: {type: 'string'}
                        },
                        {
                            name: 'notify_account',
                            in: 'query',
                            description: 'Filter for collections where the provided account is notified',
                            required: false,
                            schema: {type: 'string'}
                        },
                        ...paginationParameters,
                        {
                            name: 'sort',
                            in: 'query',
                            description: 'Column to sort',
                            required: false,
                            schema: {
                                type: 'string',
                                enum: ['created', 'collection_name'],
                                default: 'created'
                            }
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 500], {type: 'array', items: {'$ref': '#/components/schemas/Collection'}})
                }
            },
            '/v1/collections/{collection_name}': {
                get: {
                    tags: ['collections'],
                    summary: 'Find collection by its name',
                    parameters: [
                        {
                            name: 'collection_name',
                            in: 'path',
                            description: 'Name of collection',
                            required: true,
                            schema: {type: 'string'}
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 416, 500], {'$ref': '#/components/schemas/Collection'})
                }
            },
            '/v1/collections/{collection_name}/stats': {
                get: {
                    tags: ['collections'],
                    summary: 'Get stats about collection',
                    parameters: [
                        {
                            name: 'collection_name',
                            in: 'path',
                            description: 'Name of collection',
                            required: true,
                            schema: {type: 'string'}
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 500], {
                        type: 'object',
                        properties: {
                            assets: {type: 'integer'},
                            burned: {type: 'integer'},
                            templates: {type: 'integer'},
                            schemas: {type: 'integer'}
                        }
                    })
                }
            },
            '/v1/collections/{collection_name}/logs': {
                get: {
                    tags: ['collections'],
                    summary: 'Fetch collection logs',
                    parameters: [
                        {
                            name: 'collection_name',
                            in: 'path',
                            description: 'Name of collection',
                            required: true,
                            schema: {type: 'string'}
                        },
                        ...paginationParameters
                    ],
                    responses: getOpenAPI3Responses([200, 500], {type: 'array', items: {'$ref': '#/components/schemas/Log'}})
                }
            }
        },
        definitions: {}
    };
}
