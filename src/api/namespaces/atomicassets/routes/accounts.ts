import * as express from 'express';

import { getOpenAPI3Responses, paginationParameters, primaryBoundaryParameters } from '../../../docs';
import { AtomicAssetsNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { baseAssetFilterParameters, greylistFilterParameters, hideOffersParameters } from '../openapi';
import {
    getAccountAction,
    getAccountCollectionAction,
    getAccountsAction,
    getAccountsCountAction
} from '../handlers/accounts';

export function accountsEndpoints(core: AtomicAssetsNamespace, server: HTTPServer, router: express.Router): any {
    const {caching, returnAsJSON} = server.web;

    router.all('/v1/accounts', caching(), returnAsJSON(getAccountsAction, core));
    router.all('/v1/accounts/_count', caching(), returnAsJSON(getAccountsCountAction, core));

    router.all('/v1/accounts/:account', caching(), returnAsJSON(getAccountAction, core));

    router.all('/v1/accounts/:account/:collection_name', caching({ignoreQueryString: true}), returnAsJSON(getAccountCollectionAction, core));

    return {
        tag: {
            name: 'accounts',
            description: 'Accounts'
        },
        paths: {
            '/v1/accounts': {
                get: {
                    tags: ['accounts'],
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
                        ...hideOffersParameters,
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
            '/v1/accounts/{account}': {
                get: {
                    tags: ['accounts'],
                    summary: 'Get a specific account stats',
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
                                            collection: {'$ref': '#/components/schemas/Collection'},
                                            assets: {type: 'string'}
                                        }
                                    }
                                },
                                templates: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        properties: {
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
            },
            '/v1/accounts/{account}/{collection_name}': {
                get: {
                    tags: ['accounts'],
                    summary: 'Retrieves the template and schema count for the given account and collection name',
                    parameters: [
                        {
                            name: 'account',
                            in: 'path',
                            description: 'Account name',
                            required: true,
                            schema: {type: 'string'}
                        },
                        {
                            name: 'collection_name',
                            in: 'path',
                            description: 'Collection Name',
                            required: true,
                            schema: {type: 'string'}
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 500], {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                templates: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            template_id: {type: 'string'},
                                            assets: {type: 'string'}
                                        }
                                    }
                                },
                                schemas: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            schema_name: {type: 'string'},
                                            assets: {type: 'string'}
                                        }
                                    }
                                }
                            }
                        }
                    })
                }
            }
        }
    };
}
