import * as express from 'express';

import { NeftyBlendsNamespace} from '../index';
import { HTTPServer } from '../../../server';
import {
    getOpenAPI3Responses,
    paginationParameters,
} from '../../../docs';
import { getIngredientOwnershipBlendFilter, getBlendDetails } from '../handlers/blends';

export function blendsEndpoints(core: NeftyBlendsNamespace, server: HTTPServer, router: express.Router): any {
    const { caching, returnAsJSON } = server.web;
    router.all(
        '/v1/blends',
        caching(),
        returnAsJSON(getIngredientOwnershipBlendFilter, core)
    );
    router.all(
        '/v1/blends/:contract/:blend_id',
        caching(),
        returnAsJSON(getBlendDetails, core)
    );

    return {
        tag: {
            name: 'neftyblends',
            description: 'NeftyBlends'
        },
        paths: {
            '/v1/blends': {
                get: {
                    tags: ['neftyblends'],
                    summary: 'Get blends that a given collector has ingredients to',
                    description:
                        'Given a collection and an ingredient_owner, returns all ' +
                        'the blends that both: are in that collection and that the ' +
                        'ingredient_owner owns any or all ingredients to',
                    parameters: [
                        {
                            name: 'contract',
                            in: 'query',
                            description: 'Blend contract of blends (nefty.blend or blenderizerx)',
                            required: false,
                            schema: {type: 'string'}
                        },
                        {
                            name: 'collection_name',
                            in: 'query',
                            description: 'Collection name of blends',
                            required: false,
                            schema: {type: 'string'}
                        },
                        {
                            name: 'ingredient_owner',
                            in: 'query',
                            description: 'User that owns the ingredients that will be tested against each',
                            required: false,
                            schema: {type: 'string'}
                        },
                        {
                            name: 'ingredient_match',
                            in: 'query',
                            description: 'How many ingredients should be matched in each blend (all or any)',
                            required: false,
                            schema: {type: 'string'}
                        },
                        {
                            name: 'available_only',
                            in: 'query',
                            description: 'If true, it filters out all the blends that haven\'t started or have already ended',
                            required: false,
                            schema: {type: 'string'}
                        },
                        {
                            name: 'visibility',
                            in: 'query',
                            description: 'Filter visibility',
                            required: false,
                            schema: {type: 'string', enum: ['visible', 'hidden'], default: ''}
                        },

                        ...paginationParameters
                    ],
                    responses: getOpenAPI3Responses([200, 500], {
                        type: 'array',
                        items: {'$ref': '#/components/schemas/BlendDetails'}
                    })
                }
            },
            '/v1/blends/{contract}/{blend_id}': {
                get: {
                    tags: ['neftyblends'],
                    summary: 'Get blend details',
                    description: 'Get details of a single blend',
                    parameters: [
                        {
                            name: 'contract',
                            in: 'path',
                            description: 'Blend contract',
                            required: true,
                            schema: {type: 'string'}
                        },
                        {
                            name: 'blend_id',
                            in: 'path',
                            description: 'Blend id',
                            required: true,
                            schema: {type: 'string'}
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 500], { '$ref': '#/components/schemas/BlendDetails' })
                }
            },
        }
    };
}
