import * as express from 'express';

import {HelpersNamespace} from '../index';
import { HTTPServer } from '../../../server';
import {
    getOpenAPI3Responses,
    paginationParameters,
} from '../../../docs';
import {getCollectionsAction} from '../handlers/collections';

export function collectionsEndpoints(core: HelpersNamespace, server: HTTPServer, router: express.Router): any {
    const { caching, returnAsJSON } = server.web;
    router.all('/v1/collections/', caching(), returnAsJSON(getCollectionsAction, core));

    return {
        tag: {
            name: 'helpers',
            description: 'Helpers'
        },
        paths: {
            '/v1/collections': {
                get: {
                    tags: ['helpers'],
                    summary: 'Get list of collections based on status',
                    description:
                        'Get a list of collection identifiers based on the whitelisted status',
                    parameters: [
                        {
                            name: 'lists',
                            in: 'query',
                            description: "Comma separated set of lists, allowed values of each list: ['whitelist', 'blacklist', 'verified', 'nsfw', 'scam']",
                            required: false,
                            schema: {
                                type: 'string'
                            }
                        },
                        {
                            name: 'sort',
                            in: 'query',
                            description: 'Column to sort',
                            required: false,
                            schema: {
                                type: 'string',
                                enum: ['collection_name', 'list'],
                                default: 'collection_name'
                            }
                        },
                        {
                            name: 'order',
                            in: 'query',
                            description: 'Order direction',
                            required: false,
                            schema: {
                                type: 'string',
                                enum: ['asc', 'desc'],
                                default: 'desc'
                            }
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 500], {
                        type: 'array',
                        items: {'$ref': '#/components/schemas/CollectionStatus'}
                    })
                }
            },
        }
    };
}
