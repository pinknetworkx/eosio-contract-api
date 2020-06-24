import * as express from 'express';

import { AtomicAssetsNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { buildDataConditions, getLogs } from '../utils';
import { filterQueryArgs } from '../../utils';
import logger from '../../../../utils/winston';
import { formatTemplate } from '../format';
import { getOpenAPI3Responses, paginationParameters } from '../../../docs';
import { atomicDataFilter } from '../openapi';

export function templatesEndpoints(core: AtomicAssetsNamespace, server: HTTPServer, router: express.Router): any {
    async function templateRequestHandler(req: express.Request, res: express.Response): Promise<any> {
        try {
            const args = filterQueryArgs(req, {
                page: {type: 'int', min: 1, default: 1},
                limit: {type: 'int', min: 1, max: 100, default: 100},
                sort: {type: 'string', values: ['created'], default: 'created'},
                order: {type: 'string', values: ['asc', 'desc'], default: 'desc'},

                collection_name: {type: 'string', min: 1, max: 12},
                schema_name: {type: 'string', min: 1, max: 12},
                authorized_account: {type: 'string', min: 1, max: 12},

                match: {type: 'string', min: 1}
            });

            if (typeof req.params.collection_name === 'string' && req.params.collection_name.length > 0) {
                args.collection_name = req.params.collection_name;
            }

            let varCounter = 1;
            let queryString = 'SELECT * FROM atomicassets_templates_master template WHERE contract = $1 ';
            let queryValues: any[] = [core.args.atomicassets_account];

            if (args.collection_name) {
                const data = buildDataConditions(req.query, varCounter);

                if (data.conditions.length > 0) {
                    queryString += 'AND EXISTS (' +
                            'SELECT "key" ' +
                            'FROM atomicassets_templates_data data ' +
                            'WHERE data.contract = template.contract AND data.template_id = template.template_id AND ' +
                            '(' + data.conditions.join(' OR ') + ')' +
                        ') ';

                    queryValues = queryValues.concat(data.values);
                    varCounter += data.values.length;
                }
            }

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
                const parsedMatch = parseInt(args.match, 10);

                if (isNaN(parsedMatch)) {
                    queryString += 'AND (name ILIKE $' + ++varCounter + ') ';
                    queryValues.push('%' + args.match + '%');
                } else {
                    queryString += 'AND (name ILIKE $' + ++varCounter + ' OR template_id = $' + ++varCounter + ') ';
                    queryValues.push('%' + args.match + '%', args.match);
                }
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

            return res.json({success: true, data: query.rows.map((row) => formatTemplate(row)), query_time: Date.now()});
        } catch (e) {
            logger.error(req.originalUrl + ' ', e);

            res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    }

    router.get('/v1/templates', server.web.caching(), templateRequestHandler);
    router.get('/v1/templates/:collection_name', server.web.caching(), templateRequestHandler);

    router.get('/v1/templates/:collection_name/:template_id', server.web.caching({ignoreQueryString: true}), (async (req, res) => {
        try {
            const query = await core.connection.database.query(
                'SELECT template_id FROM atomicassets_templates_master WHERE contract = $1 AND collection_name = $2 AND template_id = $3 LIMIT 1',
                [core.args.atomicassets_account, req.params.collection_name, req.params.template_id]
            );

            if (query.rowCount === 0) {
                return res.status(416).json({success: false, message: 'Template not found'});
            }

            return res.json({success: true, data: formatTemplate(query.rows[0]), query_time: Date.now()});
        } catch (e) {
            logger.error(req.originalUrl + ' ', e);

            res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    }));

    router.get('/v1/templates/:collection_name/:template_id/stats', server.web.caching({ignoreQueryString: true}), (async (req, res) => {
        try {
            const query = await core.connection.database.query(
                'SELECT ' +
                '(SELECT COUNT(*) FROM atomicassets_assets WHERE contract = $1 AND collection_name = $2 AND template_id = $3) assets ',
                [core.args.atomicassets_account, req.params.collection_name, req.params.template_id]
            );

            return res.json({success: true, data: query.rows[0]});
        } catch (e) {
            logger.error(req.originalUrl + ' ', e);

            res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    }));

    router.get('/v1/templates/:collection_name/:template_id/logs', server.web.caching(), (async (req, res) => {
        const args = filterQueryArgs(req, {
            page: {type: 'int', min: 1, default: 1},
            limit: {type: 'int', min: 1, max: 100, default: 100},
            order: {type: 'string', values: ['asc', 'desc'], default: 'asc'}
        });

        try {
            res.json({
                success: true,
                data: await getLogs(
                    core.connection.database, core.args.atomicassets_account, 'template',
                    req.params.collection_name + ':' + req.params.template_id,
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
            name: 'templates',
            description: 'Templates'
        },
        paths: {
            '/v1/templates': {
                get: {
                    tags: ['templates'],
                    summary: 'Fetch templates.',
                    description: atomicDataFilter,
                    parameters: [
                        {
                            name: 'collection_name',
                            in: 'query',
                            description: 'Get all templates within the collection',
                            required: false,
                            schema: {type: 'string'}
                        },
                        {
                            name: 'schema_name',
                            in: 'query',
                            description: 'Get all templates which implement that schema',
                            required: false,
                            schema: {type: 'string'}
                        },
                        {
                            name: 'authorized_account',
                            in: 'query',
                            description: 'Filter for templates the provided account can use',
                            required: false,
                            schema: {type: 'string'}
                        },
                        {
                            name: 'match',
                            in: 'query',
                            description: 'Search for template id or',
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
                                enum: ['created'],
                                default: 'created'
                            }
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 500], {type: 'array', items: {'$ref': '#/components/schemas/Template'}})
                }
            },
            '/v1/templates/{collection_name}/{template_id}': {
                get: {
                    tags: ['templates'],
                    summary: 'Find template by id',
                    parameters: [
                        {
                            name: 'collection_name',
                            in: 'path',
                            description: 'Name of collection',
                            required: true,
                            schema: {type: 'string'}
                        },
                        {
                            name: 'template_id',
                            in: 'path',
                            description: 'ID of template',
                            required: true,
                            schema: {type: 'integer'}
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 416, 500], {'$ref': '#/components/schemas/Template'})
                }
            },
            '/v1/templates/{collection_name}/{template_id}/stats': {
                get: {
                    tags: ['templates'],
                    summary: 'Get stats about a specific template',
                    parameters: [
                        {
                            name: 'collection_name',
                            in: 'path',
                            description: 'Name of collection',
                            required: true,
                            schema: {type: 'string'}
                        },
                        {
                            name: 'template_id',
                            in: 'path',
                            description: 'ID of template',
                            required: true,
                            schema: {type: 'integer'}
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 500], {
                        type: 'object',
                        properties: {
                            assets: {type: 'integer'}
                        }
                    })
                }
            },
            '/v1/templates/{collection_name}/{template_id}/logs': {
                get: {
                    tags: ['templates'],
                    summary: 'Fetch template logs',
                    parameters: [
                        {
                            name: 'collection_name',
                            in: 'path',
                            description: 'Name of collection',
                            required: true,
                            schema: {type: 'string'}
                        },
                        {
                            name: 'template_id',
                            in: 'path',
                            description: 'ID of template',
                            required: true,
                            schema: {type: 'integer'}
                        },
                        ...paginationParameters
                    ],
                    responses: getOpenAPI3Responses([200, 500], {type: 'array', items: {'$ref': '#/components/schemas/Log'}})
                }
            }
        }
    };
}
