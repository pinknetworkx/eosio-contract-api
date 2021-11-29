import * as express from 'express';

import { AtomicToolsNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { getOpenAPI3Responses } from '../../../docs';
import { getConfigAction } from '../handlers/config';

export function configEndpoints(core: AtomicToolsNamespace, server: HTTPServer, router: express.Router): any {
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
