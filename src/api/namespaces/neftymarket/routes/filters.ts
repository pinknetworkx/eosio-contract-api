import * as express from 'express';

import { NeftyMarketNamespace} from '../index';
import { HTTPServer } from '../../../server';
import {
    getOpenAPI3Responses,
    paginationParameters,
} from '../../../docs';
import {getAttributeFiltersAction} from '../handlers/filters';

export function filtersEndpoints(core: NeftyMarketNamespace, server: HTTPServer, router: express.Router): any {
    const { caching, returnAsJSON } = server.web;
    router.get('/v1/schemas/:collection_name/attribute_value_filters', caching(), returnAsJSON(getAttributeFiltersAction, core));

    return {
        tag: {
            name: 'neftymarket',
            description: 'NeftyMarket'
        },
        paths: {
            '/v1/schemas/{collection_name}/attribute_value_filters': {
                get: {
                    tags: ['neftymarket'],
                    summary: 'Get unique (attribute_name, attribute_value) pairs',
                    description:
                        'Get every unique (attribute_name, attribute_value) pairs' +
                        'in all the templates of a collection and schema',
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
                            in: 'query',
                            description: 'Name of schema',
                            required: false,
                            schema: {type: 'string'}
                        },
                        {
                            name: 'attribute_names',
                            in: 'query',
                            description: 'Attributes to group separated by commas',
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
