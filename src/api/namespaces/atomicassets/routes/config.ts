import * as express from 'express';

import { AtomicAssetsNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { getOpenAPI3Responses } from '../../../docs';

export function configEndpoints(core: AtomicAssetsNamespace, server: HTTPServer, router: express.Router): any {
    router.get('/v1/config', server.web.caching({ignoreQueryString: true}), (async (_, res) => {
        try {
            const configQuery = await server.query(
                'SELECT * FROM atomicassets_config WHERE contract = $1',
                [core.args.atomicassets_account]
            );

            if (configQuery.rowCount === 0) {
                res.status(500);

                return res.json({success: false, message: 'Config not found'});
            }

            const config = configQuery.rows[0];

            const tokensQuery = await server.query(
                'SELECT token_symbol, token_contract, token_precision FROM atomicassets_tokens WHERE contract = $1',
                [config.contract]
            );

            return res.json({
                success: true, data: {
                    contract: config.contract,
                    version: config.version,
                    collection_format: config.collection_format,
                    supported_tokens: tokensQuery.rows
                }, query_time: Date.now()
            });
        } catch (e) {
            return res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    }));

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
