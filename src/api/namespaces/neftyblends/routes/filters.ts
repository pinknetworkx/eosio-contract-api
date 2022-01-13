import * as express from 'express';

import { NeftyBlendsNamespace} from '../index';
import { HTTPServer } from '../../../server';
import {
    getOpenAPI3Responses,
    paginationParameters,
} from '../../../docs';
import { getIngredientOwnershipBlendFilter } from '../handlers/filters'

export function filtersEndpoints(core: NeftyBlendsNamespace, server: HTTPServer, router: express.Router): any {
    const { caching, returnAsJSON } = server.web;
    router.all(
        '/v1/ingredient_ownership_blend_filter', 
        caching(), 
        returnAsJSON(getIngredientOwnershipBlendFilter, core)
    );

    // @TODO
    return {
        tag: {
            name: 'neftyblends',
            description: 'NeftyBlends'
        },
        paths: {
            '/v1/ingredient_ownership_blend_filter': {
                get: {
                    tags: ['neftyblends'],
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