import * as express from 'express';

import { AtomicToolsNamespace } from '../index';
import { HTTPServer } from '../../../server';
import {
    actionGreylistParameters,
    dateBoundaryParameters,
    getOpenAPI3Responses,
    paginationParameters,
    primaryBoundaryParameters
} from '../../../docs';
import { LinkState } from '../../../../filler/handlers/atomictools';
import { greylistFilterParameters } from '../../atomicassets/openapi';
import { getLinkAction, getLinkLogsAction, getLinksAction, getLinksCountAction } from '../handlers/links';

export function linksEndpoints(core: AtomicToolsNamespace, server: HTTPServer, router: express.Router): any {
    const {caching, returnAsJSON} = server.web;

    router.all('/v1/links', caching(), returnAsJSON(getLinksAction, core));
    router.all('/v1/links/_count', caching(), returnAsJSON(getLinksCountAction, core));

    router.all('/v1/links/:link_id', caching(), returnAsJSON(getLinkAction, core));

    router.all('/v1/links/:link_id/logs', caching(), returnAsJSON(getLinkLogsAction, core));

    return {
        tag: {
            name: 'links',
            description: 'Share Links'
        },
        paths: {
            '/v1/links': {
                get: {
                    tags: ['links'],
                    summary: 'Get all links',
                    parameters: [
                        {
                            name: 'creator',
                            in: 'query',
                            description: 'Link Creator',
                            required: false,
                            schema: {type: 'string'}
                        },
                        {
                            name: 'claimer',
                            in: 'query',
                            description: 'Claimer of the link if it was claimed',
                            required: false,
                            schema: {type: 'string'}
                        },
                        {
                            name: 'public_key',
                            in: 'query',
                            description: 'Public key which is used to share the assets',
                            required: false,
                            schema: {type: 'string'}
                        },
                        {
                            name: 'state',
                            in: 'query',
                            description: 'Filter by link state (' +
                                LinkState.WAITING.valueOf() + ': WAITING - Link created but items were not transferred yet, ' +
                                LinkState.CREATED.valueOf() + ': CREATED - Link is pending, ' +
                                LinkState.CANCELED.valueOf() + ': CANCELED - Creator canceled link, ' +
                                LinkState.CLAIMED.valueOf() + ': CLAIMED - Link was claimed, ' +
                                ') - separate multiple with ","',
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
                                enum: ['created'],
                                default: 'created'
                            }
                        }
                    ],
                    responses: getOpenAPI3Responses([500, 200], {
                        type: 'array',
                        items: {'$ref': '#/components/schemas/Link'}
                    })
                }
            },
            '/v1/links/{link_id}': {
                get: {
                    tags: ['links'],
                    summary: 'Get a specific link by id',
                    parameters: [
                        {
                            in: 'path',
                            name: 'link_id',
                            description: 'Link Id',
                            required: true,
                            schema: {type: 'integer'}
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 416, 500], {'$ref': '#/components/schemas/Link'})
                }
            },
            '/v1/links/{link_id}/logs': {
                get: {
                    tags: ['links'],
                    summary: 'Fetch link logs',
                    parameters: [
                        {
                            name: 'link_id',
                            in: 'path',
                            description: 'ID of link',
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
