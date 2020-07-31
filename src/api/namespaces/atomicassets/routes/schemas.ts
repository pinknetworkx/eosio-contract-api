import * as express from 'express';

import { AtomicAssetsNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { buildBoundaryFilter, filterQueryArgs } from '../../utils';
import { buildGreylistFilter, getLogs } from '../utils';
import logger from '../../../../utils/winston';
import { formatSchema } from '../format';
import { dateBoundaryParameters, getOpenAPI3Responses, paginationParameters, primaryBoundaryParameters } from '../../../docs';
import { greylistFilterParameters } from '../openapi';

export function schemasEndpoints(core: AtomicAssetsNamespace, server: HTTPServer, router: express.Router): any {
    async function schemaRequestHandler(req: express.Request, res: express.Response): Promise<any> {
        try {
            const args = filterQueryArgs(req, {
                page: {type: 'int', min: 1, default: 1},
                limit: {type: 'int', min: 1, max: 100, default: 100},
                sort: {type: 'string', values: ['created', 'schema_name'], default: 'created'},
                order: {type: 'string', values: ['asc', 'desc'], default: 'desc'},

                authorized_account: {type: 'string', min: 1, max: 12},
                collection_name: {type: 'string', min: 1, max: 12},
                schema_name: {type: 'string', min: 1, max: 12},

                match: {type: 'string', min: 1, max: 12}
            });

            if (typeof req.params.collection_name === 'string' && req.params.collection_name.length > 0) {
                args.collection_name = req.params.collection_name;
            }

            let varCounter = 1;
            let queryString = 'SELECT * FROM atomicassets_schemas_master WHERE contract = $1 ';

            const queryValues: any[] = [core.args.atomicassets_account];

            if (args.collection_name) {
                queryString += 'AND collection_name = $' + ++varCounter + ' ';
                queryValues.push(args.collection_name);
            }

            if (args.schema_name) {
                queryString += 'AND schema_name = $' + ++varCounter + ' ';
                queryValues.push(args.schema_name);
            }

            if (args.authorized_account) {
                queryString += 'AND $' + ++varCounter + ' = ANY(authorized_accounts) ';
                queryValues.push(args.authorized_account);
            }

            if (args.match) {
                queryString += 'AND schema_name ILIKE $' + ++varCounter + ' ';
                queryValues.push('%' + args.match + '%');
            }

            const boundaryFilter = buildBoundaryFilter(
                req, varCounter, 'schema_name', 'string',
                'created_at_time', 'created_at_block'
            );
            queryValues.push(...boundaryFilter.values);
            varCounter += boundaryFilter.values.length;
            queryString += boundaryFilter.str;

            const blacklistFilter = buildGreylistFilter(req, varCounter, 'collection_name');
            queryValues.push(...blacklistFilter.values);
            varCounter += blacklistFilter.values.length;
            queryString += blacklistFilter.str;

            const sortColumnMapping = {
                created: 'created_at_block',
                schema_name: 'schema_name'
            };

            // @ts-ignore
            queryString += 'ORDER BY ' + sortColumnMapping[args.sort] + ' ' + args.order + ', schema_name ASC ';
            queryString += 'LIMIT $' + ++varCounter + ' OFFSET $' + ++varCounter + ' ';
            queryValues.push(args.limit);
            queryValues.push((args.page - 1) * args.limit);

            logger.debug(queryString);

            const query = await core.connection.database.query(queryString, queryValues);

            return res.json({success: true, data: query.rows.map((row) => formatSchema(row)), query_time: Date.now()});
        } catch (e) {
            logger.error(req.originalUrl + ' ', e);

            res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    }

    router.get('/v1/schemas', server.web.caching(), schemaRequestHandler);
    router.get('/v1/schemas/:collection_name', server.web.caching(), schemaRequestHandler);

    router.get('/v1/schemas/:collection_name/:schema_name', server.web.caching({ignoreQueryString: true}), (async (req, res) => {
        try {
            const query = await core.connection.database.query(
                'SELECT * FROM atomicassets_schemas_master WHERE contract = $1 AND collection_name = $2 AND schema_name = $3',
                [core.args.atomicassets_account, req.params.collection_name, req.params.schema_name]
            );

            if (query.rowCount === 0) {
                return res.status(416).json({success: false, message: 'Schema not found'});
            }

            return res.json({success: true, data: formatSchema(query.rows[0])});
        } catch (e) {
            logger.error(req.originalUrl + ' ', e);

            res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    }));

    router.get('/v1/schemas/:collection_name/:schema_name/stats', server.web.caching({ignoreQueryString: true}), (async (req, res) => {
        try {
            const query = await core.connection.database.query(
                'SELECT ' +
                '(SELECT COUNT(*) FROM atomicassets_assets WHERE contract = $1 AND collection_name = $2 AND schema_name = $3) assets, ' +
                '(SELECT COUNT(*) FROM atomicassets_assets WHERE contract = $1 AND collection_name = $2 AND schema_name = $3 AND owner IS NULL) burned, ' +
                '(SELECT COUNT(*) FROM atomicassets_templates WHERE contract = $1 AND collection_name = $2 AND schema_name = $3) templates',
                [core.args.atomicassets_account, req.params.collection_name, req.params.schema_name]
            );

            return res.json({success: true, data: query.rows[0]});
        } catch (e) {
            logger.error(req.originalUrl + ' ', e);

            res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    }));

    router.get('/v1/schemas/:collection_name/:schema_name/logs', server.web.caching(), (async (req, res) => {
        const args = filterQueryArgs(req, {
            page: {type: 'int', min: 1, default: 1},
            limit: {type: 'int', min: 1, max: 100, default: 100},
            order: {type: 'string', values: ['asc', 'desc'], default: 'asc'}
        });

        try {
            res.json({
                success: true,
                data: await getLogs(
                    core.connection.database, core.args.atomicassets_account, 'schema',
                    req.params.collection_name + ':' + req.params.schema_name,
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
            name: 'schemas',
            description: 'Schemas'
        },
        paths: {
            '/v1/schemas': {
                get: {
                    tags: ['schemas'],
                    summary: 'Fetch schemas',
                    parameters: [
                        {
                            name: 'collection_name',
                            in: 'query',
                            description: 'Get all schemas within the collection',
                            required: false,
                            schema: {type: 'string'}
                        },
                        {
                            name: 'authorized_account',
                            in: 'query',
                            description: 'Filter for schemas the provided account can edit',
                            required: false,
                            schema: {type: 'string'}
                        },
                        {
                            name: 'schema_name',
                            in: 'query',
                            description: 'Schema name',
                            required: false,
                            schema: {type: 'string'}
                        },
                        {
                            name: 'match',
                            in: 'query',
                            description: 'Search for input in schema name',
                            required: false,
                            schema: {type: 'string'}
                        },
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
                                enum: ['created', 'schema_name'],
                                default: 'created'
                            }
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 500], {type: 'array', items: {'$ref': '#/components/schemas/Schema'}})
                }
            },
            '/v1/schemas/{collection_name}/{schema_name}': {
                get: {
                    tags: ['schemas'],
                    summary: 'Find schema by schema_name',
                    parameters: [
                        {
                            name: 'collection_name',
                            in: 'path',
                            description: 'Collection name of schema',
                            required: true,
                            schema: {type: 'string'}
                        },
                        {
                            name: 'schema_name',
                            in: 'path',
                            description: 'Name of schema',
                            required: true,
                            schema: {type: 'string'}
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 416, 500], {'$ref': '#/components/schemas/Schema'})
                }
            },
            '/v1/schemas/{collection_name}/{template_id}/stats': {
                get: {
                    tags: ['schemas'],
                    summary: 'Get stats about a specific schema',
                    parameters: [
                        {
                            name: 'collection_name',
                            in: 'path',
                            description: 'Collection name of schema',
                            required: true,
                            schema: {type: 'string'}
                        },
                        {
                            name: 'schema_name',
                            in: 'path',
                            description: 'Name of schema',
                            required: true,
                            schema: {type: 'string'}
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 500], {
                        type: 'object',
                        properties: {
                            assets: {type: 'integer'},
                            burned: {type: 'integer'},
                            templates: {type: 'integer'}
                        }
                    })
                }
            },
            '/v1/schemas/{collection_name}/{schema_name}/logs': {
                get: {
                    tags: ['schemas'],
                    summary: 'Fetch schema logs',
                    parameters: [
                        {
                            name: 'collection_name',
                            in: 'path',
                            description: 'Collection name of schema',
                            required: true,
                            schema: {type: 'string'}
                        },
                        {
                            name: 'schema_name',
                            in: 'path',
                            description: 'Name of schema',
                            required: true,
                            schema: {type: 'string'}
                        },
                        ...paginationParameters
                    ],
                    responses: getOpenAPI3Responses([200, 500], {type: 'array', items: {'$ref': '#/components/schemas/Log'}})
                }
            }
        }
    };
}
