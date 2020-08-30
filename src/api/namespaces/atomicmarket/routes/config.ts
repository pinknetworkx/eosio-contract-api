import * as express from 'express';

import { AtomicMarketNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { getOpenAPI3Responses } from '../../../docs';
import logger from '../../../../utils/winston';

export function configEndpoints(core: AtomicMarketNamespace, server: HTTPServer, router: express.Router): any {
    router.get('/v1/config', server.web.caching(), async (_, res) => {
        try {
            const configQuery = await server.query(
                'SELECT * FROM atomicmarket_config WHERE market_contract = $1',
                [core.args.atomicmarket_account]
            );

            const config = configQuery.rows[0];

            const queryString =
                'SELECT pair.listing_symbol, pair.settlement_symbol, pair.delphi_pair_name, pair.invert_delphi_pair, row_to_json(delphi.*) "data" ' +
                'FROM atomicmarket_symbol_pairs pair, delphioracle_pairs delphi ' +
                'WHERE pair.market_contract = $1 ' +
                'AND pair.delphi_contract = delphi.contract AND pair.delphi_pair_name = delphi.delphi_pair_name';

            const pairsQuery = await server.query(queryString, [core.args.atomicmarket_account]);

            const tokensQuery = await server.query(
                'SELECT token_contract, token_symbol, token_precision FROM atomicmarket_tokens WHERE market_contract = $1',
                [core.args.atomicmarket_account]
            );

            res.json({
                success: true, data: {
                    atomicassets_contract: core.args.atomicassets_account,
                    atomicmarket_contract: core.args.atomicmarket_account,
                    delphioracle_contract: core.args.delphioracle_account,
                    version: config.version,
                    maker_market_fee: config.maker_market_fee,
                    taker_market_fee: config.taker_market_fee,
                    minimum_auction_duration: config.minimum_auction_duration,
                    maximum_auction_duration: config.maximum_auction_duration,
                    minimum_bid_increase: config.minimum_bid_increase,
                    auction_reset_duration: config.auction_reset_duration,
                    supported_tokens: tokensQuery.rows,
                    supported_pairs: pairsQuery.rows
                }, query_time: Date.now()
            });
        } catch (e) {
            res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    });

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
