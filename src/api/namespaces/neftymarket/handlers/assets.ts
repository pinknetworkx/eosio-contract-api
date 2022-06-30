import { RequestValues } from '../../utils';
import { NeftyMarketContext } from '../index';
import { fillAssets } from '../../atomicassets/filler';
import { buildAssetFillerHook, formatListingAsset } from '../format';
import { getRawAssetsAction } from '../../atomicassets/handlers/assets';
import QueryBuilder from '../../../builder';
import {filterQueryArgs} from '../../validation';

export async function getMarketAssetsAction(params: RequestValues, ctx: NeftyMarketContext): Promise<any> {
    const args = filterQueryArgs(params, {
        symbol: {type: 'string', default: null},
    });

    const result = await getRawAssetsAction(params, ctx, {
        hook: (query: QueryBuilder) => {
            query.appendToBase('LEFT JOIN neftymarket_template_prices "price" ' +
                'ON (' +
                'asset.contract = price.assets_contract AND asset.template_id = price.template_id' +
                (args.symbol ? ' AND "price".symbol = ' + query.addVariable(args.symbol) : '') +
                ')'
            );
        },
        extraSort: {
            suggested_median_price: {column: '"price".suggested_median', nullable: true, numericIndex: false},
            suggested_average_price: {column: '"price".suggested_average', nullable: true, numericIndex: false},
            average_price: {column: '"price".average', nullable: true, numericIndex: false},
            median_price: {column: '"price".median', nullable: true, numericIndex: false},
        },
    });

    if (!Array.isArray(result)) {
        return result;
    }

    return await fillAssets(
        ctx.db, ctx.coreArgs.atomicassets_account,
        result,
        formatListingAsset, 'neftymarket_assets_master',
        buildAssetFillerHook({fetchPrices: true, fetchNeftyAuctions: true})
    );
}

export async function getMarketAssetsCountAction(params: RequestValues, ctx: NeftyMarketContext): Promise<any> {
    return getMarketAssetsAction({...params, count: 'true'}, ctx);
}
