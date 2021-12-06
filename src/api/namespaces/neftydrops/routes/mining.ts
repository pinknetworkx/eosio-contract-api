import * as express from 'express';

import { NeftyDropsNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { dateBoundaryParameters, getOpenAPI3Responses, paginationParameters } from '../../../docs';
import {
  getClaimersAction, getClaimersCountAction,
  getCollectionsAction,
  getCollectionsCountAction
} from '../handlers/mining';

export function miningEndpoints(core: NeftyDropsNamespace, server: HTTPServer, router: express.Router): any {
  const { caching, returnAsJSON } = server.web;
  router.all('/v1/mining/collections', caching(), returnAsJSON(getCollectionsAction, core));
  router.all('/v1/mining/collections/_count', caching(), returnAsJSON(getCollectionsCountAction, core));
  router.all('/v1/mining/claimers', caching(), returnAsJSON(getClaimersAction, core));
  router.all('/v1/mining/claimers/_count', caching(), returnAsJSON(getClaimersCountAction, core));

  return {
    tag: {
      name: 'mining',
      description: 'Liquidity Mining'
    },
    paths: {
      '/v1/mining/collections': {
        get: {
          tags: ['mining'],
          summary: 'Get sellers WAX and $Neftys WAX equivalent balance between given period.',
          description: 'Get sellers WAX and $Neftys WAX equivalent balance between given period.',
          parameters: [
            ...dateBoundaryParameters,
            ...paginationParameters,
            {
              name: 'sort',
              in: 'query',
              description: 'Column to sort',
              required: false,
              schema: {
                type: 'string',
                enum: [
                  'collection_name', 'sold_wax', 'sold_nefty'
                ],
                default: 'collection_name'
              }
            }
          ],
          responses: getOpenAPI3Responses([200, 500], {
            type: 'array',
            items: {'$ref': '#/components/schemas/CollectionsBalance'}
          })
        }
      },
      '/v1/mining/claimers': {
        get: {
          tags: ['mining'],
          summary: 'Get buyers WAX and $Neftys WAX equivalent balance between given period.',
          description: 'Get buyers WAX and $Neftys WAX equivalent balance between given period.',
          parameters: [
            ...dateBoundaryParameters,
            ...paginationParameters,
            {
              name: 'sort',
              in: 'query',
              description: 'Column to sort',
              required: false,
              schema: {
                type: 'string',
                enum: [
                  'claimer', 'spent_wax', 'spent_nefty'
                ],
                default: 'claimer'
              }
            }
          ],
          responses: getOpenAPI3Responses([200, 500], {
            type: 'array',
            items: {'$ref': '#/components/schemas/ClaimersBalance'}
          })
        }
      }
    }
  };
}
