import * as express from 'express';

import { NeftyDropsNamespace } from '../index';
import { HTTPServer } from '../../../server';
import {FilterDefinition, filterQueryArgs, mergeRequestData} from '../../utils';
import {buildRangeCondition} from '../../neftydrops/utils';
import { dateBoundaryParameters, getOpenAPI3Responses, paginationParameters } from '../../../docs';
import QueryBuilder from '../../../builder';

export function miningEndpoints(core: NeftyDropsNamespace, server: HTTPServer, router: express.Router): any {
  const sort_collection = {
    type: 'string',
    values: [
      'collection_name', 'sold_wax', 'sold_nefty'
    ],
    default: 'collection_name'
  };
  const sort_claimer = {
    type: 'string',
    values: [
      'claimer', 'spent_wax', 'spent_nefty'
    ],
    default: 'claimer'
  };

  function miningFilterQueryArgs(sort: any): FilterDefinition {
    return {
      before: {type: 'int', min: 1, default: 0},
      after: {type: 'int', min: 1, default: 0},
      page: {type: 'int', min: 1, default: 1},
      limit: {type: 'int', min: 1, max: 100, default: 100},
      sort: sort,
      order: {type: 'string', values: ['asc', 'desc'], default: 'desc'}
    };
  }

  function buildClaimsQuery(after?: number, before?: number): string {
    return ` FROM neftydrops_claims
             WHERE settlement_symbol IS DISTINCT FROM 'NULL'
                  AND drops_contract = $1
                  ${buildRangeCondition('"created_at_time"', after, before)}`;
  }
  function buildGroupQuery(group_by: string, 
      sort: string, order: string, limit: number): string {
    return ` GROUP BY ${group_by}
             ORDER BY ${sort} ${order}
             LIMIT ${limit}`;
  }

  router.get('/v1/mining/collections', server.web.caching(), async (req, res) => {
    try {
      const args = filterQueryArgs(req, miningFilterQueryArgs(sort_collection));
      
      let queryString = `SELECT collection_name, 
      SUM(CASE settlement_symbol WHEN 'WAX' THEN final_price ELSE 0 END) AS sold_wax, 
      SUM(CASE settlement_symbol WHEN 'NEFTY' THEN core_amount ELSE 0 END) AS sold_nefty `
        + buildClaimsQuery(args.after, args.before)
        + buildGroupQuery('collection_name', args.sort, args.order, args.limit);
      const query = new QueryBuilder(queryString, [core.args.neftydrops_account]);
      const collectionSales = await server.query(query.buildString(), query.buildValues());
      
      res.json({success: true, data: collectionSales.rows, query_time: Date.now()});
    } catch (e) {
      res.status(500).json({success: false, message: 'Internal Server Error'});
    }
  });

  router.get('/v1/mining/claimers', server.web.caching(), async (req, res) => {
    try {
      const args = filterQueryArgs(req, miningFilterQueryArgs(sort_claimer));
      let queryString = `SELECT claimer, 
      SUM(CASE COALESCE(spent_symbol, 'NULL') WHEN 'NULL' 
          THEN (CASE settlement_symbol WHEN 'WAX' THEN final_price ELSE 0 END)
          ELSE 0 END) AS spent_wax, 
      SUM(CASE spent_symbol WHEN 'NEFTY' THEN core_amount ELSE 0 END) AS spent_nefty `
        + buildClaimsQuery(args.after, args.before)
        + buildGroupQuery('claimer', args.sort, args.order, args.limit);
      const query = new QueryBuilder(queryString, [core.args.neftydrops_account]);
      const userPurchases = await server.query(query.buildString(), query.buildValues());
      
      res.json({success: true, data: userPurchases.rows, query_time: Date.now()});
    } catch (e) {
      res.status(500).json({success: false, message: 'Internal Server Error'});
    }
  });

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
            items: {'$ref': '#/components/schemas/Collections'}
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
            items: {'$ref': '#/components/schemas/Claimers'}
          })
        }
      }
    }
  };
}