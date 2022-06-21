import { RequestValues } from '../../utils';
import { AtomicMarketContext } from '../index';
import { fillAssets } from '../../atomicassets/filler';
import { buildAssetFillerHook, formatListingAsset } from '../format';
import { getRawAssetsAction } from '../../atomicassets/handlers/assets';
import {filterQueryArgs} from '../../validation';
import QueryBuilder from '../../../builder';

export async function getMarketAssetsAction(params: RequestValues, ctx: AtomicMarketContext): Promise<any> {
    const args = filterQueryArgs(params, {
        symbol: {type: 'string', default: null},
    });

    const result = await getRawAssetsAction(params, ctx, {
        extraSort: {
            suggested_median_price: {column: '"price".suggested_median', nullable: true, numericIndex: false},
            suggested_average_price: {column: '"price".suggested_average', nullable: true, numericIndex: false},
            average_price: {column: '"price".average', nullable: true, numericIndex: false},
            median_price: {column: '"price".median', nullable: true, numericIndex: false},
        },
        hook: (query: QueryBuilder) => {
            query.appendToBase('LEFT JOIN atomicmarket_template_prices "price" ' +
                'ON (' +
                'asset.contract = price.assets_contract AND asset.template_id = price.template_id' +
                (args.symbol ? ' AND "price".symbol = ' + query.addVariable(args.symbol) : '') +
                ')'
            );
        },
    });

    if (!Array.isArray(result)) {
        return result;
    }

    return await fillAssets(
        ctx.db, ctx.coreArgs.atomicassets_account,
        result,
        formatListingAsset, 'atomicmarket_assets_master',
        buildAssetFillerHook({fetchSales: true, fetchAuctions: true, fetchPrices: true, fetchNeftyAuctions: ctx.coreArgs.include_nefty_auctions})
    );
}

export async function getMarketAssetsCountAction(params: RequestValues, ctx: AtomicMarketContext): Promise<any> {
    return getMarketAssetsAction({...params, count: 'true'}, ctx);
}
