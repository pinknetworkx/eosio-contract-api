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
import { buildBoundaryFilter, filterQueryArgs } from '../../utils';
import {
    respondApiError
} from '../../../utils';
import QueryBuilder from '../../../builder';
import { fillAssets } from '../../atomicassets/filler';
import { buildAssetQueryCondition } from '../../atomicassets/routes/assets';
import { buildAssetFillerHook, formatListingAsset } from '../format';
import { hasAssetFilter, hasDataFilters } from '../../atomicassets/utils';
import { hasListingFilter } from '../utils';

export function assetsEndpoints(core: AtomicMarketNamespace, server: HTTPServer, router: express.Router): any {
    router.all(['/v1/assets', '/v1/assets/_count'], server.web.caching(), async (req, res) => {
        try {
            const args = filterQueryArgs(req, {
                page: {type: 'int', min: 1, default: 1},
                limit: {type: 'int', min: 1, max: 1000, default: 100},
                sort: {type: 'string', min: 1},
                order: {type: 'string', values: ['asc', 'desc'], default: 'desc'},
            });

            const query = new QueryBuilder(
                'SELECT asset.asset_id FROM atomicassets_assets asset ' +
                'LEFT JOIN atomicassets_templates "template" ON (' +
                'asset.contract = template.contract AND asset.template_id = template.template_id' +
                ') ' +
                'LEFT JOIN atomicmarket_template_prices "price" ON (' +
                'asset.contract = price.assets_contract AND asset.template_id = price.template_id' +
                ') '
            );

            query.equal('asset.contract', core.args.atomicassets_account);

            buildAssetQueryCondition(req, query, {assetTable: '"asset"', templateTable: '"template"'});
            buildBoundaryFilter(
                req, query, 'asset.asset_id', 'int',
                args.sort === 'updated' ? 'asset.updated_at_time' : 'asset.minted_at_time'
            );

            if (req.originalUrl.search('/_count') >= 0) {
                const countQuery = await server.query(
                    'SELECT COUNT(*) counter FROM (' + query.buildString() + ') x',
                    query.buildValues()
                );

                return res.json({success: true, data: countQuery.rows[0].counter, query_time: Date.now()});
            }

            let sorting: {column: string, nullable: boolean, numericIndex: boolean};

            if (args.sort) {
                const sortColumnMapping: {[key: string]: {column: string, nullable: boolean, numericIndex: boolean}} = {
                    asset_id: {column: 'asset.asset_id', nullable: false, numericIndex: true},
                    updated: {column: 'asset.updated_at_time', nullable: false, numericIndex: true},
                    transferred: {column: 'asset.transferred_at_time', nullable: false, numericIndex: true},
                    minted: {column: 'asset.asset_id', nullable: false, numericIndex: true},
                    template_mint: {column: 'asset.template_mint', nullable: true, numericIndex: false},
                    name: {column: '"template".immutable_data->>\'name\'', nullable: true, numericIndex: false},
                    suggested_median_price: {column: '"price".suggested_median', nullable: true, numericIndex: false},
                    suggested_average_price: {column: '"price".suggested_average', nullable: true, numericIndex: false},
                    average_price: {column: '"price".average', nullable: true, numericIndex: false},
                    median_price: {column: '"price".median', nullable: true, numericIndex: false},
                };

                sorting = sortColumnMapping[args.sort];
            }

            if (!sorting) {
                sorting = {column: 'asset.asset_id', nullable: false, numericIndex: true};
            }

            const ignoreIndex = (hasAssetFilter(req) || hasDataFilters(req) || hasListingFilter(req)) && sorting.numericIndex;

            query.append('ORDER BY ' + sorting.column + (ignoreIndex ? ' + 1 ' : ' ') + args.order + ' ' + (sorting.nullable ? 'NULLS LAST' : '') + ', asset.asset_id ASC');
            query.append('LIMIT ' + query.addVariable(args.limit) + ' OFFSET ' + query.addVariable((args.page - 1) * args.limit));

            const result = await server.query(query.buildString(), query.buildValues());

            const assets = await fillAssets(
                server, core.args.atomicassets_account,
                result.rows.map(row => row.asset_id),
                formatListingAsset, 'atomicmarket_assets_master',
                buildAssetFillerHook({fetchSales: true, fetchAuctions: true, fetchPrices: true})
            );

            return res.json({success: true, data: assets, query_time: Date.now()});
        } catch (error) {
            return respondApiError(res, error);
        }
    });

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
