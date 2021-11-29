import * as express from 'express';

import { AtomicAssetsNamespace } from '../index';
import { HTTPServer } from '../../../server';
import {
    actionGreylistParameters,
    dateBoundaryParameters,
    getOpenAPI3Responses,
    paginationParameters,
    primaryBoundaryParameters
} from '../../../docs';
import { atomicDataFilter, greylistFilterParameters } from '../openapi';
import {
    getTemplateAction, getTemplateLogsAction,
    getTemplatesAction,
    getTemplatesCountAction,
    getTemplateStatsAction
} from '../handlers/templates';

export function templatesEndpoints(core: AtomicAssetsNamespace, server: HTTPServer, router: express.Router): any {
    const {caching, returnAsJSON} = server.web;

    router.all('/v1/templates', caching(), returnAsJSON(getTemplatesAction, core));
    router.all('/v1/templates/_count', caching(), returnAsJSON(getTemplatesCountAction, core));

    router.all('/v1/templates/:collection_name/:template_id', caching({ignoreQueryString: true}), returnAsJSON(getTemplateAction, core));

    router.all('/v1/templates/:collection_name/:template_id/stats', caching({ignoreQueryString: true}), returnAsJSON(getTemplateStatsAction, core));

    router.all('/v1/templates/:collection_name/:template_id/logs', caching(), returnAsJSON(getTemplateLogsAction, core));

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
                            name: 'issued_supply',
                            in: 'query',
                            description: 'Filter by issued supply',
                            required: false,
                            schema: {type: 'number'}
                        },
                        {
                            name: 'min_issued_supply',
                            in: 'query',
                            description: 'Filter by issued supply',
                            required: false,
                            schema: {type: 'number'}
                        },
                        {
                            name: 'max_issued_supply',
                            in: 'query',
                            description: 'Filter by issued supply',
                            required: false,
                            schema: {type: 'number'}
                        },
                        {
                            name: 'has_assets',
                            in: 'query',
                            description: 'Only show templates with existing supply > 0',
                            required: false,
                            schema: {type: 'boolean'}
                        },
                        {
                            name: 'max_supply',
                            in: 'query',
                            description: 'Filter by max supply',
                            required: false,
                            schema: {type: 'number'}
                        },
                        {
                            name: 'is_burnable',
                            in: 'query',
                            description: 'Filter by burnable',
                            required: false,
                            schema: {type: 'boolean'}
                        },
                        {
                            name: 'is_transferable',
                            in: 'query',
                            description: 'Filter by transferable',
                            required: false,
                            schema: {type: 'boolean'}
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
                                enum: ['name', 'created'],
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
                            assets: {type: 'string'},
                            burned: {type: 'string'}
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
                        ...paginationParameters,
                        ...actionGreylistParameters
                    ],
                    responses: getOpenAPI3Responses([200, 500], {type: 'array', items: {'$ref': '#/components/schemas/Log'}})
                }
            }
        }
    };
}
