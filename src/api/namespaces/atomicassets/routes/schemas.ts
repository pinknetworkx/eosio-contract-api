import * as express from 'express';

import { AtomicAssetsNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { filterQueryArgs } from '../../utils';
import { getLogs } from '../utils';
import logger from '../../../../utils/winston';
import { formatSchema } from '../format';
import { standardArrayFilter } from '../swagger';

export function schemasEndpoints(core: AtomicAssetsNamespace, _: HTTPServer, router: express.Router): any {
    async function schemaRequestHandler(req: express.Request, res: express.Response): Promise<any> {
        try {
            const args = filterQueryArgs(req, {
                page: {type: 'int', min: 1, default: 1},
                limit: {type: 'int', min: 1, max: 100, default: 100},
                sort: {type: 'string', values: ['created'], default: 'created'},
                order: {type: 'string', values: ['asc', 'desc'], default: 'desc'},

                authorized_account: {type: 'string', min: 1, max: 12},
                collection_name: {type: 'string', min: 1, max: 12},

                match: {type: 'string', min: 1, max: 12}
            });

            if (typeof req.params.collection_name === 'string' && req.params.collection_name.length > 0) {
                args.collection_name = req.params.collection_name;
            }

            let varCounter = 1;
            let queryString = 'SELECT * FROM atomicassets_schemas_master WHERE contract = $1 ';

            const queryValues: any[] = [core.args.contract];

            if (args.collection_name) {
                queryString += 'AND collection_name = $' + ++varCounter + ' ';
                queryValues.push(args.collection_name);
            }

            if (args.authorized_account) {
                queryString += 'AND $' + ++varCounter + ' = ANY(authorized_accounts) ';
                queryValues.push(args.authorized_account);
            }

            if (args.match) {
                queryString += 'AND schema_name LIKE $' + ++varCounter + ' ';
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

            return res.json({success: true, data: query.rows.map((row) => formatSchema(row))});
        } catch (e) {
            logger.error(e);

            res.status(500);
            res.json({success: false, message: 'Internal Server Error'});
        }
    }

    router.get('/v1/schemas', schemaRequestHandler);
    router.get('/v1/schemas/:collection_name', schemaRequestHandler);

    router.get('/v1/schemas/:collection_name/:schema_name', (async (req, res) => {
        try {
            const query = await core.connection.database.query(
                'SELECT * FROM atomicassets_schemas_master WHERE contract = $1 AND collection_name = $2 AND schema_name = $3',
                [core.args.contract, req.params.collection_name, req.params.schema_name]
            );

            if (query.rowCount === 0) {
                res.status(500);
                return res.json({success: false, message: 'Schema not found'});
            }

            return res.json({success: true, data: formatSchema(query.rows[0])});
        } catch (e) {
            logger.error(e);

            res.status(500);
            res.json({success: false, message: 'Internal Server Error'});
        }
    }));

    router.get('/v1/schemas/:collection_name/:schema_name/logs', (async (req, res) => {
        const args = filterQueryArgs(req, {
            page: {type: 'int', min: 1, default: 1},
            limit: {type: 'int', min: 1, max: 100, default: 100}
        });

        try {
            res.json({
                success: true,
                data: await getLogs(
                    core.connection.database, core.args.contract, 'schema',
                    req.params.collection_name + ':' + req.params.schema_name,
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
            name: 'schemas',
            description: 'Schemas'
        },
        paths: {
            '/v1/schemas': {
                get: {
                    tags: ['schemas'],
                    summary: 'Fetch schemas',
                    produces: ['application/json'],
                    parameters: [
                        {
                            name: 'collection_name',
                            in: 'query',
                            description: 'Get all schemas within the collection',
                            required: false,
                            type: 'string'
                        },
                        {
                            name: 'authorized_account',
                            in: 'query',
                            description: 'Filter for schemas the provided account can edit',
                            required: false,
                            type: 'string'
                        },
                        {
                            name: 'match',
                            in: 'query',
                            description: 'Search for input in schema name',
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
                                    data: {type: 'array', items: {'$ref': '#/definitions/Schema'}}
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
            '/v1/schemas/{collection_name}/{schema_name}': {
                get: {
                    tags: ['schemas'],
                    summary: 'Find schema by schema_name',
                    produces: ['application/json'],
                    parameters: [
                        {
                            name: 'collection_name',
                            in: 'path',
                            description: 'Collection name of schema',
                            required: true,
                            type: 'string'
                        },
                        {
                            name: 'schema_name',
                            in: 'path',
                            description: 'Name of schema',
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
                                    data: {'$ref': '#/definitions/Schema'}
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
            '/v1/schemas/{collection_name}/{schema_name}/logs': {
                get: {
                    tags: ['schemas'],
                    summary: 'Fetch schema logs',
                    produces: ['application/json'],
                    parameters: [
                        {
                            name: 'collection_name',
                            in: 'path',
                            description: 'Collection name of schema',
                            required: true,
                            type: 'string'
                        },
                        {
                            name: 'schema_name',
                            in: 'path',
                            description: 'Name of schema',
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
