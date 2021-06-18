import * as express from 'express';

import { AtomicAssetsNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { buildBoundaryFilter, filterQueryArgs } from '../../utils';
import { buildGreylistFilter } from '../utils';
import { formatSchema } from '../format';
import {
    actionGreylistParameters,
    dateBoundaryParameters,
    getOpenAPI3Responses,
    paginationParameters,
    primaryBoundaryParameters
} from '../../../docs';
import { greylistFilterParameters } from '../openapi';
import { applyActionGreylistFilters, getContractActionLogs } from '../../../utils';
import QueryBuilder from '../../../builder';

export function schemasEndpoints(core: AtomicAssetsNamespace, server: HTTPServer, router: express.Router): any {
    router.all(['/v1/schemas', '/v1/schemas/_count'], server.web.caching(), (async (req, res) => {
        try {
            const args = filterQueryArgs(req, {
                page: {type: 'int', min: 1, default: 1},
                limit: {type: 'int', min: 1, max: 100, default: 100},
                sort: {type: 'string', values: ['created', 'schema_name'], default: 'created'},
                order: {type: 'string', values: ['asc', 'desc'], default: 'desc'},

                authorized_account: {type: 'string', min: 1, max: 12},
                collection_name: {type: 'string', min: 1},
                schema_name: {type: 'string', min: 1},

                match: {type: 'string', min: 1, max: 12}
            });

            const query = new QueryBuilder('SELECT * FROM atomicassets_schemas_master WHERE contract = $1 ');
            query.equal('contract', core.args.atomicassets_account);

            if (args.collection_name) {
                query.equalMany('collection_name', args.collection_name.split(','));
            }

            if (args.schema_name) {
                query.equalMany('schema_name', args.schema_name.split(','));
            }

            if (args.authorized_account) {
                query.addCondition(query.addVariable(args.authorized_account) + ' = ANY(authorized_accounts)');
            }

            if (args.match) {
                query.addCondition('POSITION(' + query.addVariable(args.match.toLowerCase()) + ' IN schema_name) > 0');
            }

            buildBoundaryFilter(req, query, 'schema_name', 'string', 'created_at_time');
            buildGreylistFilter(req, query, {collectionName: 'collection_name'});

            if (req.originalUrl.search('/_count') >= 0) {
                const countQuery = await server.query(
                    'SELECT COUNT(*) counter FROM (' + query.buildString() + ') x',
                    query.buildValues()
                );

                return res.json({success: true, data: countQuery.rows[0].counter, query_time: Date.now()});
            }

            const sortColumnMapping: {[key: string]: string} = {
                created: 'created_at_time',
                schema_name: 'schema_name'
            };

            query.append('ORDER BY ' + sortColumnMapping[args.sort] + ' ' + args.order + ', schema_name ASC');
            query.append('LIMIT ' + query.addVariable(args.limit) + ' OFFSET ' + query.addVariable((args.page - 1) * args.limit) + ' ');

            const result = await server.query(query.buildString(), query.buildValues());

            return res.json({success: true, data: result.rows.map((row) => formatSchema(row)), query_time: Date.now()});
        } catch (e) {
            res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    }));

    router.all('/v1/schemas/:collection_name/:schema_name', server.web.caching({ignoreQueryString: true}), (async (req, res) => {
        try {
            const query = await server.query(
                'SELECT * FROM atomicassets_schemas_master WHERE contract = $1 AND collection_name = $2 AND schema_name = $3',
                [core.args.atomicassets_account, req.params.collection_name, req.params.schema_name]
            );

            if (query.rowCount === 0) {
                return res.status(416).json({success: false, message: 'Schema not found'});
            }

            return res.json({success: true, data: formatSchema(query.rows[0])});
        } catch (e) {
            res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    }));

    router.all('/v1/schemas/:collection_name/:schema_name/stats', server.web.caching({ignoreQueryString: true}), (async (req, res) => {
        try {
            const query = await server.query(
                'SELECT ' +
                '(SELECT COUNT(*) FROM atomicassets_assets WHERE contract = $1 AND collection_name = $2 AND schema_name = $3) assets, ' +
                '(SELECT COUNT(*) FROM atomicassets_assets WHERE contract = $1 AND collection_name = $2 AND schema_name = $3 AND owner IS NULL) burned, ' +
                '(SELECT COUNT(*) FROM atomicassets_templates WHERE contract = $1 AND collection_name = $2 AND schema_name = $3) templates',
                [core.args.atomicassets_account, req.params.collection_name, req.params.schema_name]
            );

            return res.json({success: true, data: query.rows[0]});
        } catch (e) {
            res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    }));

    router.all('/v1/schemas/:collection_name/:schema_name/logs', server.web.caching(), (async (req, res) => {
        const args = filterQueryArgs(req, {
            page: {type: 'int', min: 1, default: 1},
            limit: {type: 'int', min: 1, max: 100, default: 100},
            order: {type: 'string', values: ['asc', 'desc'], default: 'asc'}
        });

        try {
            res.json({
                success: true,
                data: await getContractActionLogs(
                    server, core.args.atomicassets_account,
                    applyActionGreylistFilters(['createschema', 'extendschema'], args),
                    {collection_name: req.params.collection_name, schema_name: req.params.schema_name},
                    (args.page - 1) * args.limit, args.limit, args.order
                ), query_time: Date.now()
            });
        } catch (e) {
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
            '/v1/schemas/{collection_name}/{schema_name}/stats': {
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
                            assets: {type: 'string'},
                            burned: {type: 'string'},
                            templates: {type: 'string'}
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
                        ...paginationParameters,
                        ...actionGreylistParameters
                    ],
                    responses: getOpenAPI3Responses([200, 500], {type: 'array', items: {'$ref': '#/components/schemas/Log'}})
                }
            }
        }
    };
}
