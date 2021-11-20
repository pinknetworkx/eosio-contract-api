import { buildBoundaryFilter, filterQueryArgs, RequestValues } from '../../../utils';
import { AtomicMarketContext } from '../../index';
import QueryBuilder from '../../../../builder';
import { buildAssetQueryCondition } from '../../../atomicassets/routes/assets';
import { hasAssetFilter, hasDataFilters } from '../../../atomicassets/utils';
import { hasListingFilter } from '../../utils';
import { fillAssets } from '../../../atomicassets/filler';
import { buildAssetFillerHook, formatListingAsset } from '../../format';

export async function getAssetsAction(params: RequestValues, ctx: AtomicMarketContext): Promise<any> {
    const args = filterQueryArgs(params, {
        page: {type: 'int', min: 1, default: 1},
        limit: {type: 'int', min: 1, max: 1000, default: 100},
        sort: {type: 'string', min: 1},
        order: {type: 'string', values: ['asc', 'desc'], default: 'desc'},

        count: {type: 'bool'}
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

    query.equal('asset.contract', ctx.core.args.atomicassets_account);

    buildAssetQueryCondition(params, query, {assetTable: '"asset"', templateTable: '"template"'});
    buildBoundaryFilter(
        params, query, 'asset.asset_id', 'int',
        args.sort === 'updated' ? 'asset.updated_at_time' : 'asset.minted_at_time'
    );

    if (args.count) {
        const countQuery = await ctx.db.query(
            'SELECT COUNT(*) counter FROM (' + query.buildString() + ') x',
            query.buildValues()
        );

        return countQuery.rows[0].counter;
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

    const ignoreIndex = (hasAssetFilter(params) || hasDataFilters(params) || hasListingFilter(params)) && sorting.numericIndex;

    query.append('ORDER BY ' + sorting.column + (ignoreIndex ? ' + 1 ' : ' ') + args.order + ' ' + (sorting.nullable ? 'NULLS LAST' : '') + ', asset.asset_id ASC');
    query.paginate(args.page, args.limit);

    const result = await ctx.db.query(query.buildString(), query.buildValues());

    return await fillAssets(
        ctx.db, ctx.core.args.atomicassets_account,
        result.rows.map(row => row.asset_id),
        formatListingAsset, 'atomicmarket_assets_master',
        buildAssetFillerHook({fetchSales: true, fetchAuctions: true, fetchPrices: true})
    );
}

export async function getAssetsCountAction(params: RequestValues, ctx: AtomicMarketContext): Promise<any> {
    return getAssetsAction({...params, count: 'true'}, ctx);
}
