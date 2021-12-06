import * as express from 'express';

import { NeftyDropsNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { getOpenAPI3Responses } from '../../../docs';
import { getConfigAction } from '../handlers/config';

export function configEndpoints(core: NeftyDropsNamespace, server: HTTPServer, router: express.Router): any {
    const { caching, returnAsJSON } = server.web;
    router.get('/v1/config', caching(), returnAsJSON(getConfigAction, core));

    return {
        tag: {
            name: 'config',
            description: 'Config'
        },
        paths: {
            '/v1/config': {
                get: {
                    tags: ['config'],
                    summary: 'Get neftyblocks config',
                    responses: getOpenAPI3Responses([200], {
                        type: 'object',
                        properties: {
                            neftydrops_contract: {type: 'string'},
                            atomicassets_contract: {type: 'string'},
                            delphioracle_contract: {type: 'string'},
                            version: {type: 'string'},
                            drop_fee: {type: 'number'},
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
                            },
                            supported_pairs: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        listing_symbol: {type: 'string'},
                                        settlement_symbol: {type: 'string'},
                                        delphi_pair_name: {type: 'string'},
                                        invert_delphi_pair: {type: 'boolean'}
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
