import * as express from 'express';

import { AtomicToolsNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { getOpenAPI3Responses } from '../../../docs';

export function configEndpoints(core: AtomicToolsNamespace, server: HTTPServer, router: express.Router): any {
    router.get('/v1/config', server.web.caching(), async (_, res) => {
        try {
            const configQuery = await server.query(
                'SELECT * FROM atomictools_config WHERE tools_contract = $1',
                [core.args.atomictools_account]
            );

            res.json({
                success: true,
                data: {
                    atomictools_contract: core.args.atomictools_account,
                    atomicassets_contract: core.args.atomicassets_account,
                    version: configQuery.rows[0].version
                },
                query_time: Date.now()
            });
        } catch (e) {
            return res.status(500).json({success: false, message: 'Internal Server Error'});
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
                    summary: 'Get atomictools config',
                    responses: getOpenAPI3Responses([200], {
                        type: 'object',
                        properties: {
                            atomictools_contract: {type: 'string'},
                            atomicassets_contract: {type: 'string'},
                            version: {type: 'string'}
                        }
                    })
                }
            }
        }
    };
}
