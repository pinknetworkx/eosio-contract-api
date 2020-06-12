import * as express from 'express';

import { AtomicAssetsNamespace } from '../index';
import { HTTPServer } from '../../../server';
import logger from '../../../../utils/winston';
import { getOpenAPI3Responses } from '../../../docs';

export function configEndpoints(core: AtomicAssetsNamespace, server: HTTPServer, router: express.Router): any {
    router.get('/v1/config', server.web.caching({ignoreQueryString: true}), (async (_, res) => {
        try {
            const query = await core.connection.database.query(
                'SELECT * FROM atomicassets_config WHERE contract = $1',
                [core.args.atomicassets_account]
            );

            if (query.rowCount === 0) {
                res.status(500);

                return res.json({success: false, message: 'Config not found'});
            }

            return res.json({success: true, data: {
                contract: core.args.atomicassets_account,
                version: query.rows[0].version,
                collection_format: query.rows[0].collection_format
            }, query_time: Date.now()});
        } catch (e) {
            logger.error(e);

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
                            }
                        }
                    })
                }
            }
        }
    };
}
