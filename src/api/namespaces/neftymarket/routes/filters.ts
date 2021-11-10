import * as express from 'express';

import { NeftyMarketNamespace} from '../index';
import { HTTPServer } from '../../../server';
import { filterQueryArgs } from '../../utils';
import QueryBuilder from '../../../builder';
import {
    getOpenAPI3Responses,
    paginationParameters,
} from '../../../docs';
import logger from '../../../../utils/winston';

export function filtersEndpoints(core: NeftyMarketNamespace, server: HTTPServer, router: express.Router): any {
    router.all(['/v1/schemas/:collection_name/:schema_name/attribute_value_filters', '/v1/schemas/:collection_name/:schema_name/attribute_value_filters/_count'], server.web.caching({ignoreQueryString: true}), (async (req, res) => {
        try {
            const args = filterQueryArgs(req, {
                page: {type: 'int', min: 1, default: 1},
                limit: {type: 'int', min: 1, max: 1000, default: 100},
                sort: {type: 'string', values: ['key', 'value'], default: 'key'},
                order: {type: 'string', values: ['asc', 'desc'], default: 'desc'},
            });

            const query = new QueryBuilder(`
                SELECT DISTINCT d.key, d.value
                FROM
                    atomicassets_templates as t, 
                    jsonb_each(t.immutable_data) as d 
                WHERE 
                    t.contract = $1 AND
                    t.collection_name = $2 AND
                    t.schema_name = $3
                ORDER BY
                    d.${args.sort} ${args.order}
                LIMIT $4
                OFFSET $5
            `);

            const queryArgs = [
                core.args.atomicassets_account, 
                req.params.collection_name, 
                req.params.schema_name,
                args.limit,
                (args.page - 1) * args.limit
            ];

            const result = await server.query(query.buildString(), queryArgs);

            res.json({success: true, data: result.rows, query_time: Date.now()});
        } catch (e) {
            logger.error(e);
            res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    }));

    return {
        tag: {
            name: 'neftymarket',
            description: 'NeftyMarket'
        },
        paths: {
            '/v1/neftymarket/{collection_name}/{schema_name}/attribute_value_filters': {
                get: {
                    tags: ['neftymarket'],
                    summary: 'Get unique (attribute_name, atribute_value) pairs',
                    description: 
                        'Get every unique (attribute_name, atribute_value) pairs' + 
                        'in all the templates of a schema',
                    parameters: [
                        {
                            name: 'collection_name',
                            in: 'path',
                            description: 'Collection name of schema',
                            required: true,
                            schema: {type: 'string'}
                        },
                        {
                            name: 'schema_name',
                            in: 'path',
                            description: 'Name of schema',
                            required: true,
                            schema: {type: 'string'}
                        },
                        ...paginationParameters
                    ],
                    responses: getOpenAPI3Responses([200, 500], {
                        type: 'array',
                        items: {'$ref': '#/components/schemas/AttributeValueFilter'}
                    })
                }
            },
        }
    };
}
