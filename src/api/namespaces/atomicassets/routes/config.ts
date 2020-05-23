import * as express from 'express';

import { AtomicAssetsNamespace } from '../index';
import { HTTPServer } from '../../../server';
import logger from '../../../../utils/winston';

export function configEndpoints(core: AtomicAssetsNamespace, _a: HTTPServer, router: express.Router): any {
    router.get('/v1/config', (async (_b, res) => {
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
            }});
        } catch (e) {
            logger.error(e);

            res.status(500);
            return res.json({success: false, message: 'Internal Server Error'});
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
                    produces: ['application/json'],
                    responses: {
                        '200': {
                            description: 'OK',
                            schema: {
                                type: 'object',
                                properties: {
                                    success: {type: 'boolean', default: true},
                                    data: {
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
                                    }
                                }
                            }
                        },
                        '500': {
                            description: 'Internal Server Error',
                            schema: {
                                type: 'object',
                                properties: {
                                    success: {type: 'boolean', default: false},
                                    message: {type: 'string'}
                                }
                            }
                        }
                    }
                }
            }
        },
        definitions: {}
    };
}
