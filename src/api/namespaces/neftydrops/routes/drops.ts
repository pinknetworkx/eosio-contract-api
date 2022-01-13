import * as express from 'express';

import {DropApiState, NeftyDropsNamespace} from '../index';
import { HTTPServer } from '../../../server';
import {
    dateBoundaryParameters, getOpenAPI3Responses,
    paginationParameters,
    primaryBoundaryParameters
} from '../../../docs';
import {dropDataFilter, dropsFilterParameters} from '../openapi';
import {
    getDropAction,
    getDropClaimsAction,
    getDropClaimsCountAction,
    getDropsAction,
    getDropsCountAction
} from '../handlers/drops';

export function dropsEndpoints(core: NeftyDropsNamespace, server: HTTPServer, router: express.Router): any {
    const { caching, returnAsJSON } = server.web;
    router.all('/v1/drops', caching(), returnAsJSON(getDropsAction, core));
    router.all('/v1/drops/_count', caching(), returnAsJSON(getDropsCountAction, core));
    router.all('/v1/drops/:drop_id', caching(), returnAsJSON(getDropAction, core));
    router.all('/v1/drops/:drop_id/claims', caching(), returnAsJSON(getDropClaimsAction, core));
    router.all('/v1/drops/:drop_id/claims/_count', caching(), returnAsJSON(getDropClaimsCountAction, core));

    return {
        tag: {
            name: 'drops',
            description: 'Drops'
        },
        paths: {
            '/v1/drops': {
                get: {
                    tags: ['drops'],
                    summary: 'Get all drops. ',
                    description: dropDataFilter,
                    parameters: [
                        {
                            name: 'state',
                            in: 'query',
                            description: 'Filter by drop state (' +
                                DropApiState.ACTIVE.valueOf() + ': ACTIVE - The drop is active, ' +
                                DropApiState.DELETED.valueOf() + ': DELETED - The drop is deleted' +
                                DropApiState.SOLD_OUT.valueOf() + ': SOLD_OUT - The drop is sold out' +
                                ') - separate multiple with ","',
                            required: false,
                            schema: {type: 'string'}
                        },
                        {
                            name: 'hidden',
                            in: 'query',
                            description: 'Display hidden drops',
                            required: false,
                            schema: {type: 'boolean'}
                        },
                        ...primaryBoundaryParameters,
                        ...dropsFilterParameters,
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
                                    'created', 'updated', 'drop_id', 'price',
                                    'start_time', 'end_time',
                                ],
                                default: 'created'
                            }
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 500], {
                        type: 'array',
                        items: {'$ref': '#/components/schemas/Drop'}
                    })
                }
            },
            '/v1/drops/{drop_id}': {
                get: {
                    tags: ['drops'],
                    summary: 'Get a specific drop by id',
                    parameters: [
                        {
                            in: 'path',
                            name: 'drop_id',
                            description: 'Drop Id',
                            required: true,
                            schema: {type: 'integer'}
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 416, 500], {'$ref': '#/components/schemas/Drop'})
                }
            },
            '/v1/drops/{drop_id}/claims': {
                get: {
                    tags: ['drops'],
                    summary: 'Fetch drop claims',
                    parameters: [
                        {
                            name: 'drop_id',
                            in: 'path',
                            description: 'ID of drop',
                            required: true,
                            schema: {type: 'integer'}
                        },
                        ...paginationParameters,
                        {
                            name: 'sort',
                            in: 'query',
                            description: 'Column to sort',
                            required: false,
                            schema: {
                                type: 'string',
                                enum: [
                                    'claim_time', 'price', 'amount', 'claimer'
                                ],
                                default: 'claim_time'
                            }
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 500], {type: 'array', items: {'$ref': '#/components/schemas/Claim'}})
                }
            }
        }
    };
}
