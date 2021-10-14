import * as express from 'express';

import { NeftyDropsNamespace } from '../index';
import { HTTPServer } from '../../../server';
import {FilterDefinition, filterQueryArgs} from '../../utils';
import {buildRangeCondition} from '../utils';
import { dateBoundaryParameters, getOpenAPI3Responses, paginationParameters } from '../../../docs';
import { SaleState } from '../../../../filler/handlers/atomicmarket';
import QueryBuilder from '../../../builder';

export function marketplaceEndpoints(core: NeftyDropsNamespace, server: HTTPServer, router: express.Router): any {
  
  function marketFilterQueryArgs(sort: any): FilterDefinition {
    return {
      before: {type: 'int', min: 1, default: 0},
      after: {type: 'int', min: 1, default: 0},
      page: {type: 'int', min: 1, default: 1},
      limit: {type: 'int', min: 1, max: 1000, default: 100},
      sort: sort,
      order: {type: 'string', values: ['asc', 'desc'], default: 'desc'}
    };
  }
  function buildGroupQuery(group_by: string,
      sort: string, order: string, limit: number, page: number): string {
    const offset = (page - 1) * limit;
    return `GROUP BY ${group_by}
      ORDER BY ${sort} ${order}
      LIMIT ${limit}
      OFFSET ${offset}`;
  }

  router.get(['/v1/marketplace/sellers'], server.web.caching(), async (req, res) => {
    try {
      const group_by = 'seller';
      const args = filterQueryArgs(req, marketFilterQueryArgs({
        type: 'string',
        values: [group_by, 'sold_wax'],
        default: group_by
      }));

      const rangeCondition = buildRangeCondition('updated_at_time', args.after, args.before);
      const groupBy = buildGroupQuery(group_by, args.sort, args.order, args.limit, args.page);
      const queryString = `
      SELECT ${group_by}, SUM(final_price) AS sold_wax
      FROM atomicmarket_sales
        WHERE state = ${SaleState.SOLD} 
          AND settlement_symbol = 'WAX'
          AND market_contract = $1
          AND (taker_marketplace = $2 OR maker_marketplace = $2)
          ${rangeCondition}
      ${groupBy}`;
      const query = new QueryBuilder(queryString, 
        [core.args.atomicmarket_account, core.args.neftymarket_name]);
      const soldByUsers = await server.query(query.buildString(), query.buildValues());

      res.json({success: true, data: soldByUsers.rows, query_time: Date.now()});
    } catch (e) {
      res.status(500).json({success: false, message: 'Internal Server Error'});
    }
  });

  router.get(['/v1/marketplace/buyers'], server.web.caching(), async (req, res) => {
    try {
      const group_by = 'buyer';
      const args = filterQueryArgs(req, marketFilterQueryArgs({
        type: 'string',
        values: [group_by, 'sold_wax'],
        default: group_by
      }));

      const rangeCondition = buildRangeCondition('updated_at_time', args.after, args.before);
      const groupBy = buildGroupQuery(group_by, args.sort, args.order, args.limit, args.page);
      const queryString = `
      SELECT ${group_by}, SUM(final_price) AS sold_wax
      FROM atomicmarket_sales
        WHERE state = ${SaleState.SOLD} 
          AND settlement_symbol = 'WAX'
          AND market_contract = $1
          AND (taker_marketplace = $2 OR maker_marketplace = $2)
          ${rangeCondition}
      ${groupBy}`;
      const query = new QueryBuilder(queryString, 
        [core.args.atomicmarket_account, core.args.neftymarket_name]);
      const boughtByUsers = await server.query(query.buildString(), query.buildValues());

      res.json({success: true, data: boughtByUsers.rows, query_time: Date.now()});
    } catch (e) {
      res.status(500).json({success: false, message: 'Internal Server Error'});
    }
  });

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
          summary: 'Get buyers WAX balance between given period.',
          description: 'Get buyers WAX balance between given period.' +
            'Will bring the sales table sum from SOLD offers in the Nefty Market, grouped by buyer.',
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
      }
    }
  };
}
