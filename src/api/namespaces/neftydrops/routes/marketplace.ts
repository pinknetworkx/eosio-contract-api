import * as express from 'express';

import { NeftyDropsNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { dateBoundaryParameters, getOpenAPI3Responses, paginationParameters } from '../../../docs';
import {
  getBuyersAction,
  getBuyersCountAction,
  getCollectionsAction,
  getCollectionsCountAction,
  getSellersAction,
  getSellersCountAction
} from '../handlers/marketplace';

export function marketplaceEndpoints(core: NeftyDropsNamespace, server: HTTPServer, router: express.Router): any {

  const { caching, returnAsJSON } = server.web;
  router.all('/v1/marketplace/sellers', caching(), returnAsJSON(getSellersAction, core));
  router.all('/v1/marketplace/sellers/_count', caching(), returnAsJSON(getSellersCountAction, core));
  router.all('/v1/marketplace/buyers', caching(), returnAsJSON(getBuyersAction, core));
  router.all('/v1/marketplace/buyers/_count', caching(), returnAsJSON(getBuyersCountAction, core));
  router.all('/v1/marketplace/collections', caching(), returnAsJSON(getCollectionsAction, core));
  router.all('/v1/marketplace/collections/_count', caching(), returnAsJSON(getCollectionsCountAction, core));

  return {
    tag: {
      name: 'marketplace',
      description: 'Marketplace'
    },
    paths: {
      '/v1/marketplace/sellers': {
        get: {
          tags: ['marketplace'],
          summary: 'Get sellers WAX balance between given period.',
          description: 'Get sellers WAX balance between given period. ' +
            'Will bring the sales table sum from SOLD offers in the Nefty Market, grouped by seller.',
          parameters: [
            {
              name: 'collection',
              in: 'query',
              description: 'Only show results belonging to this collection name',
              required: false,
              schema: {
                type: 'string'
              }
            },
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
                  'seller', 'sold_wax'
                ],
                default: 'seller'
              }
            }
          ],
          responses: getOpenAPI3Responses([200, 500], {
            type: 'array',
            items: {'$ref': '#/components/schemas/SellersBalance'}
          })
        }
      },
      '/v1/marketplace/buyers': {
        get: {
          tags: ['marketplace'],
          summary: 'Get buyers WAX spent between given period.',
          description: 'Get buyers WAX spent between given period.' +
            'Will bring the sales table sum from SOLD offers in the Nefty Market, grouped by buyer.',
          parameters: [
            {
              name: 'collection',
              in: 'query',
              description: 'Only show results belonging to this collection name',
              required: false,
              schema: {
                type: 'string'
              }
            },
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
                  'buyer', 'spent_wax'
                ],
                default: 'buyer'
              }
            }
          ],
          responses: getOpenAPI3Responses([200, 500], {
            type: 'array',
            items: {'$ref': '#/components/schemas/BuyersBalance'}
          })
        }
      },
      '/v1/marketplace/collections': {
        get: {
          tags: ['marketplace'],
          summary: 'Get collections WAX sold between given period.',
          description: 'Get collections WAX sold between given period.' +
            'Will bring the sales table sum from SOLD offers in the Nefty Market, grouped by collection.',
          parameters: [
            {
              name: 'collection',
              in: 'query',
              description: 'Only show results belonging to this collection name',
              required: false,
              schema: {
                type: 'string'
              }
            },
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
                  'collection_name', 'sold_wax'
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
      }
    }
  };
}
