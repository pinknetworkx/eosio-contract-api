import * as express from 'express';

import { AtomicMarketNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { getOpenAPI3Responses } from '../../../docs';
import { getMarketplaceAction, getMarketplacesAction } from '../handlers/marketplaces';

export function marketplacesEndpoints(core: AtomicMarketNamespace, server: HTTPServer, router: express.Router): any {
    const {caching, returnAsJSON} = server.web;

    router.all('/v1/marketplaces', caching(), returnAsJSON(getMarketplacesAction, core));

    router.all('/v1/marketplaces/:name', caching(), returnAsJSON(getMarketplaceAction, core));

    return {
        tag: {
            name: 'marketplaces',
            description: 'Marketplaces'
        },
        paths: {
            '/v1/marketplaces': {
                get: {
                    tags: ['marketplaces'],
                    summary: 'Get all registered marketplaces',
                    responses: getOpenAPI3Responses([200], {
                        type: 'array',
                        items: {'$ref': '#/components/schemas/Marketplace'}
                    })
                }
            },
            '/v1/marketplaces/{marketplace_name}': {
                get: {
                    tags: ['marketplaces'],
                    summary: 'Get atomicmarket config',
                    parameters: [
                        {
                            in: 'path',
                            name: 'marketplace_name',
                            description: 'Marketplace name',
                            required: true,
                            schema: {type: 'string'}
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 416, 500], {'$ref': '#/components/schemas/Marketplace'})
                }
            }
        }
    };
}
