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

                attribute_names: {type: 'string', default: ""}
            });

            if(args.attribute_names === ""){
                return res.status(400).json(
                    {
                        success: false, 
                        message: "Error in query param: 'attribute_names'"
                    }
                );
            }

            // We dont want the attribute_names to be case sensitive
            const lowerCaseAttributeNames = args.attribute_names.split(',').map(
                (attrName:string):string => attrName.toLowerCase()
            );

            const query = new QueryBuilder(`
                SELECT v.key, v.value
                FROM
                    neftydrops_attribute_filters as v
            `);
            query.equal('v.contract', core.args.atomicassets_account);
            query.equal('v.collection_name', req.params.collection_name);
            query.equal('v.schema_name', req.params.schema_name);
            query.equalMany('LOWER(v.key)', lowerCaseAttributeNames);

            query.append(`
                ORDER BY
                    v.${args.sort} ${args.order}
                LIMIT ${query.addVariable(args.limit)}
                OFFSET ${query.addVariable((args.page - 1) * args.limit)}
            `)

            const result = await server.query(query.buildString(), query.buildValues());

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
