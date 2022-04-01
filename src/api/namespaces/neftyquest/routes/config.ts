import * as express from 'express';

import { NeftyQuestNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { getOpenAPI3Responses } from '../../../docs';
import { getConfigAction } from '../handlers/config';

export function configEndpoints(core: NeftyQuestNamespace, server: HTTPServer, router: express.Router): any {
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
                    summary: 'Get neftyquest config',
                    responses: getOpenAPI3Responses([200], {
                        type: 'object',
                        properties: {
                            contract: {type: 'string'},
                            collection_name: {type: 'string'},
                            template_id: {type: 'number'},
                            balance_attribute_name: {type: 'string'},
                            quest_duration: {type: 'number'},
                            points_per_asset: {type: 'number'},
                            min_asset_value: { type: 'number'},
                            min_asset_value_symbol: { type: 'string'},
                            points_per_volume: { type: 'number'},
                            volume_threshold: { type: 'number'},
                            volume_threshold_symbol: { type: 'string'},
                            minimum_volume: { type: 'number'},
                            minimum_volume_symbol: { type: 'string'},
                        }
                    })
                }
            }
        }
    };
}
