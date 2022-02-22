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
                    summary: 'Get collections and the lists they are on',
                    description:
                        'Get all collections that are in any list, and the lists they are in.',
                    parameters: [],
                    responses: getOpenAPI3Responses([200, 500], {
                        type: 'array',
                        items: {'$ref': '#/components/schemas/CollectionStatus'}
                    })
                }
            },
        }
    };
}
