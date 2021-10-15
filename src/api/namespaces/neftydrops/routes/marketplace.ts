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
      collection: {type: 'string'},
      page: {type: 'int', min: 1, default: 1},
      limit: {type: 'int', min: 1, max: 1000, default: 100},
      sort: sort,
      order: {type: 'string', values: ['asc', 'desc'], default: 'desc'}
    };
  }
  function buildGroupQuery(group_by: string): string {
    return `GROUP BY ${group_by}`;
  }
  function buildLimitQuery(
      sort: string, order: string, limit: number, page: number): string {
    const offset = (page - 1) * limit;
    return `
      ORDER BY ${sort} ${order}
      LIMIT ${limit}
      OFFSET ${offset}`;
  }

  router.get(['/v1/marketplace/sellers', '/v1/marketplace/sellers/_count'],
      server.web.caching(), async (req, res) => {
    try {
      const group_by = 'seller';
      const args = filterQueryArgs(req, marketFilterQueryArgs({
        type: 'string',
        values: [group_by, 'sold_wax'],
        default: group_by
      }));

      const parameters = [core.args.atomicmarket_account, core.args.neftymarket_name];
      const rangeCondition = buildRangeCondition('updated_at_time', args.after, args.before);
      const groupBy = buildGroupQuery(group_by);

      let collectionFilter = '';
      if (args.collection) {
        collectionFilter = ' AND collection_name = $3';
        parameters.push(args.collection);
      }

      let queryString = `
      SELECT ${group_by}, SUM(final_price) AS sold_wax
      FROM atomicmarket_sales
        WHERE state = ${SaleState.SOLD} 
          AND settlement_symbol = 'WAX'
          AND market_contract = $1
          AND maker_marketplace = $2
          ${collectionFilter}
          ${rangeCondition}
      ${groupBy}`;

      if (req.originalUrl.search('/_count') >= 0) {
        queryString = `SELECT COUNT(*) FROM (${queryString}) AS res`;
      } else {
        queryString += buildLimitQuery(args.sort, args.order, args.limit, args.page);
      }

      const query = new QueryBuilder(queryString, parameters);
      const soldByUsers = await server.query(query.buildString(), query.buildValues());
      const result = req.originalUrl.search('/_count') >= 0 ?
          soldByUsers.rows[0].count : soldByUsers.rows;

      res.json({success: true, data: result, query_time: Date.now()});
    } catch (e) {
      res.status(500).json({success: false, message: 'Internal Server Error'});
    }
  });

  router.get(['/v1/marketplace/buyers', '/v1/marketplace/buyers/_count'],
      server.web.caching(), async (req, res) => {
    try {
      const group_by = 'buyer';
      const args = filterQueryArgs(req, marketFilterQueryArgs({
        type: 'string',
        values: [group_by, 'spent_wax'],
        default: group_by
      }));

      const parameters = [core.args.atomicmarket_account, core.args.neftymarket_name];
      const rangeCondition = buildRangeCondition('updated_at_time', args.after, args.before);
      const groupBy = buildGroupQuery(group_by);

      let collectionFilter = '';
      if (args.collection) {
        collectionFilter = ' AND collection_name = $3';
        parameters.push(args.collection);
      }

      let queryString = `
      SELECT ${group_by}, SUM(final_price) AS spent_wax
      FROM atomicmarket_sales
        WHERE state = ${SaleState.SOLD} 
          AND settlement_symbol = 'WAX'
          AND market_contract = $1
          AND taker_marketplace = $2
          ${collectionFilter}
          ${rangeCondition}
      ${groupBy}`;

      if (req.originalUrl.search('/_count') >= 0) {
        queryString = `SELECT COUNT(*) FROM (${queryString}) AS res`;
      } else {
        queryString += buildLimitQuery(args.sort, args.order, args.limit, args.page);
      }

      const query = new QueryBuilder(queryString, parameters);
      const boughtByUsers = await server.query(query.buildString(), query.buildValues());
      const result = req.originalUrl.search('/_count') >= 0 ?
          boughtByUsers.rows[0].count : boughtByUsers.rows;

      res.json({success: true, data: result, query_time: Date.now()});
    } catch (e) {
      res.status(500).json({success: false, message: 'Internal Server Error'});
    }
  });

  router.get(['/v1/marketplace/collections', '/v1/marketplace/collections/_count'],
      server.web.caching(), async (req, res) => {
    try {
      const group_by = 'collection_name';
      const args = filterQueryArgs(req, marketFilterQueryArgs({
        type: 'string',
        values: [group_by, 'sold_wax'],
        default: group_by
      }));

      const parameters = [core.args.atomicmarket_account, core.args.neftymarket_name];
      const rangeCondition = buildRangeCondition('updated_at_time', args.after, args.before);
      const groupBy = buildGroupQuery(group_by);

      let collectionFilter = '';
      if (args.collection) {
        collectionFilter = ' AND collection_name = $3';
        parameters.push(args.collection);
      }

      let queryString = `
      SELECT ${group_by}, SUM(final_price) AS sold_wax
      FROM atomicmarket_sales
        WHERE state = ${SaleState.SOLD} 
          AND settlement_symbol = 'WAX'
          AND market_contract = $1
          AND taker_marketplace = $2
          ${collectionFilter}
          ${rangeCondition}
      ${groupBy}`;

      if (req.originalUrl.search('/_count') >= 0) {
        queryString = `SELECT COUNT(*) FROM (${queryString}) AS res`;
      } else {
        queryString += buildLimitQuery(args.sort, args.order, args.limit, args.page);
      }

      const query = new QueryBuilder(queryString, parameters);
      const soldByCollection = await server.query(query.buildString(), query.buildValues());
      const result = req.originalUrl.search('/_count') >= 0 ?
          soldByCollection.rows[0].count : soldByCollection.rows;

      res.json({success: true, data: result, query_time: Date.now()});
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
