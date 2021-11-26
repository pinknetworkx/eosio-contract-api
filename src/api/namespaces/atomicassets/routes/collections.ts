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
import { greylistFilterParameters } from '../openapi';
import {
    getCollectionAction, getCollectionLogsAction,
    getCollectionsAction, getCollectionSchemasAction,
    getCollectionsCountAction,
    getCollectionStatsAction
} from '../handlers/collections';

export function collectionsEndpoints(core: AtomicAssetsNamespace, server: HTTPServer, router: express.Router): any {
    const {caching, returnAsJSON} = server.web;

    router.all('/v1/collections', caching(), returnAsJSON(getCollectionsAction, core));
    router.all('/v1/collections/_count', caching(), returnAsJSON(getCollectionsCountAction, core));

    router.all('/v1/collections/:collection_name', caching({ignoreQueryString: true}), returnAsJSON(getCollectionAction, core));

    router.all('/v1/collections/:collection_name/stats', caching({ignoreQueryString: true}), returnAsJSON(getCollectionStatsAction, core));

    router.all('/v1/collections/:collection_name/schemas', caching({ignoreQueryString: true}), returnAsJSON(getCollectionSchemasAction, core));

    router.all('/v1/collections/:collection_name/logs', caching(), returnAsJSON(getCollectionLogsAction, core));

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
                            assets: {type: 'string'},
                            burned: {type: 'string'},
                            templates: {type: 'string'},
                            schemas: {type: 'string'}
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
                        ...paginationParameters,
                        ...actionGreylistParameters
                    ],
                    responses: getOpenAPI3Responses([200, 500], {type: 'array', items: {'$ref': '#/components/schemas/Log'}})
                }
            }
        },
        definitions: {}
    };
}
