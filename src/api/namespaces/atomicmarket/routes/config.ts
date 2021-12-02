import * as express from 'express';

import { AtomicMarketNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { getOpenAPI3Responses } from '../../../docs';
import { getConfigAction } from '../handlers/config';

export function configEndpoints(core: AtomicMarketNamespace, server: HTTPServer, router: express.Router): any {
    const {caching, returnAsJSON} = server.web;

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
                    summary: 'Get atomicmarket config',
                    responses: getOpenAPI3Responses([200], {
                        type: 'object',
                        properties: {
                            atomicassets_contract: {type: 'string'},
                            atomicmarket_contract: {type: 'string'},
                            delphioracle_contract: {type: 'string'},
                            version: {type: 'string'},
                            maker_market_fee: {type: 'number'},
                            taker_market_fee: {type: 'number'},
                            minimum_auction_duration: {type: 'integer'},
                            maximum_auction_duration: {type: 'integer'},
                            minimum_bid_increase: {type: 'number'},
                            auction_reset_duration: {type: 'integer'},
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
