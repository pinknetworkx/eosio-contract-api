import * as express from 'express';

import { AtomicMarketNamespace } from '../index';
import { HTTPServer } from '../../../server';
import {
    dateBoundaryParameters,
    getOpenAPI3Responses,
    paginationParameters,
    primaryBoundaryParameters
} from '../../../docs';
import {
    extendedAssetFilterParameters,
    atomicDataFilter,
    greylistFilterParameters,
    hideOffersParameters,
    baseAssetFilterParameters, completeAssetFilterParameters
} from '../../atomicassets/openapi';
import { getMarketAssetsAction, getMarketAssetsCountAction } from '../handlers/assets';

export function assetsEndpoints(core: AtomicMarketNamespace, server: HTTPServer, router: express.Router): any {
    const {caching, returnAsJSON} = server.web;
    router.all('/v1/assets', caching(), returnAsJSON(getMarketAssetsAction, core));
    router.all('/v1/assets/_count', caching(), returnAsJSON(getMarketAssetsCountAction, core));

    return {
        tag: {
            name: 'assets',
            description: 'Assets'
        },
        paths: {
            '/v1/assets': {
                get: {
                    tags: ['assets'],
                    summary: 'Fetch assets.',
                    description: atomicDataFilter,
                    parameters: [
                        ...baseAssetFilterParameters,
                        ...extendedAssetFilterParameters,
                        ...completeAssetFilterParameters,
                        ...hideOffersParameters,
                        ...greylistFilterParameters,
                        ...primaryBoundaryParameters,
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
                                    'asset_id', 'minted', 'updated', 'transferred',
                                    'template_mint', 'name', 'suggested_median_price',
                                    'suggested_average_price', 'median_price', 'average_price'
                                ],
                                default: 'asset_id'
                            }
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 500], {type: 'array', items: {'$ref': '#/components/schemas/ListingAsset'}})
                }
            }
        }
    };
}
