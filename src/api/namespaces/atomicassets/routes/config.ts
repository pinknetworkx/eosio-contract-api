import * as express from 'express';

import { AtomicAssetsNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { getOpenAPI3Responses } from '../../../docs';
import { getConfigAction } from '../handlers/config';

export function configEndpoints(core: AtomicAssetsNamespace, server: HTTPServer, router: express.Router): any {
    const {caching, returnAsJSON} = server.web;

    router.get('/v1/config', caching({ignoreQueryString: true}), returnAsJSON(getConfigAction, core));

    return {
        tag: {
            name: 'config',
            description: 'Config'
        },
        paths: {
            '/v1/config': {
                get: {
                    tags: ['config'],
                    summary: 'Get general information about the API and the connected contract',
                    responses: getOpenAPI3Responses([200, 500], {
                        type: 'object',
                        properties: {
                            contract: {type: 'string'},
                            version: {type: 'string'},
                            collection_format: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        name: {type: 'string'},
                                        type: {type: 'string'}
                                    }
                                }
                            },
                            supported_tokens: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        token_contract: {type: 'string'},
                                        token_symbol: {type: 'string'},
                                        token_precision: {type: 'integer'}
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
