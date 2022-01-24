import { RequestValues } from '../../utils';
import { AtomicMarketContext } from '../index';
import { fillAssets } from '../../atomicassets/filler';
import { buildAssetFillerHook, formatListingAsset } from '../format';
import { getRawAssetsAction } from '../../atomicassets/handlers/assets';

export async function getMarketAssetsAction(params: RequestValues, ctx: AtomicMarketContext): Promise<any> {
    const result = await getRawAssetsAction(params, ctx, {
        extraTables: 'LEFT JOIN atomicmarket_template_prices "price" ON (asset.contract = price.assets_contract AND asset.template_id = price.template_id)',
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
        formatListingAsset, 'atomicmarket_assets_master',
        buildAssetFillerHook({fetchSales: true, fetchAuctions: true, fetchPrices: true})
    );
}

export async function getMarketAssetsCountAction(params: RequestValues, ctx: AtomicMarketContext): Promise<any> {
    return getMarketAssetsAction({...params, count: 'true'}, ctx);
}
