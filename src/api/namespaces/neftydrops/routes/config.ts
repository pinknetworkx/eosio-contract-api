import * as express from 'express';

import { NeftyDropsNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { getOpenAPI3Responses } from '../../../docs';

export function configEndpoints(core: NeftyDropsNamespace, server: HTTPServer, router: express.Router): any {
    router.get('/v1/config', server.web.caching(), async (_, res) => {
        try {
            const configQuery = await server.query(
                'SELECT * FROM neftydrops_config WHERE drops_contract = $1',
                [core.args.neftydrops_account]
            );

            if (configQuery.rowCount === 0) {
                res.status(500);

                return res.json({success: false, message: 'Config not found'});
            }

            const config = configQuery.rows[0];

            const queryString =
                'SELECT pair.listing_symbol, pair.settlement_symbol, pair.delphi_pair_name, pair.invert_delphi_pair, row_to_json(delphi.*) "data" ' +
                'FROM neftydrops_symbol_pairs pair, delphioracle_pairs delphi ' +
                'WHERE pair.drops_contract = $1 ' +
                'AND pair.delphi_contract = delphi.contract AND pair.delphi_pair_name = delphi.delphi_pair_name';

            const pairsQuery = await server.query(queryString, [core.args.neftydrops_account]);

            const tokensQuery = await server.query(
                'SELECT token_contract, token_symbol, token_precision FROM neftydrops_tokens WHERE drops_contract = $1',
                [core.args.neftydrops_account]
            );

            res.json({
                success: true, data: {
                    neftydrops_contract: core.args.neftydrops_account,
                    atomicassets_contract: config.atomicassets_contract,
                    delphioracle_contract: config.delphioracle_account,
                    version: config.version,
                    drop_fee: config.drop_fee,
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
