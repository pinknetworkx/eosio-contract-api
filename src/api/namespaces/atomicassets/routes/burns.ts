import * as express from 'express';

import { getOpenAPI3Responses, paginationParameters, primaryBoundaryParameters } from '../../../docs';
import { AtomicAssetsNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { baseAssetFilterParameters, greylistFilterParameters, hideOffersParameters } from '../openapi';
import { getBurnsAccountAction, getBurnsAction } from '../handlers/burns';

export function burnEndpoints(core: AtomicAssetsNamespace, server: HTTPServer, router: express.Router): any {
    const {caching, returnAsJSON} = server.web;

    router.all('/v1/burns', caching(), returnAsJSON(getBurnsAction, core));

    router.all('/v1/burns/:account', caching(), returnAsJSON(getBurnsAccountAction, core));

    return {
        tag: {
            name: 'burns',
            description: 'Burns'
        },
        paths: {
            '/v1/burns': {
                get: {
                    tags: ['burns'],
                    summary: 'Get accounts which own atomicassets NFTs',
                    parameters: [
                        {
                            name: 'match_owner',
                            in: 'query',
                            description: 'Search for partial account name',
                            required: false,
                            schema: {type: 'string'}
                        },
                        ...baseAssetFilterParameters,
                        ...greylistFilterParameters,
                        ...primaryBoundaryParameters,
                        ...paginationParameters
                    ],
                    responses: getOpenAPI3Responses([200, 500], {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                account: {type: 'string'},
                                assets: {type: 'string'}
                            }
                        }
                    })
                }
            },
            '/v1/burns/{account}': {
                get: {
                    tags: ['burns'],
                    summary: 'Get a specific account',
                    parameters: [
                        {
                            name: 'account',
                            in: 'path',
                            description: 'Account name',
                            required: true,
                            schema: {type: 'string'}
                        },
                        ...hideOffersParameters,
                        ...greylistFilterParameters
                    ],
                    responses: getOpenAPI3Responses([200, 500], {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                collections: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            collection_name: {type: 'string'},
                                            assets: {type: 'string'}
                                        }
                                    }
                                },
                                templates: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            collection_name: {type: 'string'},
                                            template_id: {type: 'string'},
                                            assets: {type: 'string'}
                                        }
                                    }
                                },
                                assets: {type: 'string'}
                            }
                        }
                    })
                }
            }
        }
    };
}
