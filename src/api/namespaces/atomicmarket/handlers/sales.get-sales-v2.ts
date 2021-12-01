import { buildBoundaryFilter, filterQueryArgs, FilterValues, RequestValues } from '../../utils';
import { AtomicMarketContext, SaleApiState } from '../index';
import QueryBuilder from '../../../builder';
import { buildListingFilter, hasListingFilter } from '../utils';
import { buildAssetFilter, buildGreylistFilter, hasAssetFilter, hasDataFilters } from '../../atomicassets/utils';
import { fillSales } from '../filler';
import { formatSale } from '../format';
import { ApiError } from '../../../error';
import { SaleState } from '../../../../filler/handlers/atomicmarket';
import { OfferState } from '../../../../filler/handlers/atomicassets';

export async function getSalesV2Action(params: RequestValues, ctx: AtomicMarketContext): Promise<any> {

    const args = filterQueryArgs(params, {
        page: {type: 'int', min: 1, default: 1},
        limit: {type: 'int', min: 1, max: 100, default: 100},
        // collection_name: {type: 'string', min: 1},
        sort: {
            type: 'string',
            values: [
                'created', 'updated', 'sale_id', 'price',
                'template_mint'
            ],
            default: 'created'
        },
        order: {type: 'string', values: ['asc', 'desc'], default: 'desc'},
        count: {type: 'bool'}
    });

    const query = new QueryBuilder(`
                SELECT listing.sale_id
                FROM atomicmarket_sales_filters listing
            `);

    query.equal('listing.market_contract', ctx.coreArgs.atomicmarket_account);

    await buildSaleFilterV2(params, query, ctx);
/*
    if (!args.collection_name) {
        buildGreylistFilter(params, query, {collectionName: 'listing.collection_name'});
    }

    buildBoundaryFilter(
        params, query, 'listing.sale_id', 'int',
        args.sort === 'updated' ? 'listing.updated_at_time' : 'listing.created_at_time'
    );

    if (args.count) {
        const countQuery = await ctx.db.query(
            'SELECT COUNT(*) counter FROM (' + query.buildString() + ') x',
            query.buildValues()
        );

        return countQuery.rows[0].counter;
    }
*/
    const sortMapping: { [key: string]: { column: string, nullable: boolean, numericIndex: boolean } } = {
        sale_id: {column: 'listing.sale_id', nullable: false, numericIndex: true},
        created: {column: 'listing.created_at_time', nullable: false, numericIndex: true},
        updated: {column: 'listing.updated_at_time', nullable: false, numericIndex: true},
        price: {column: 'listing.price', nullable: true, numericIndex: false},
        template_mint: {column: 'LOWER(listing.template_mint)', nullable: true, numericIndex: false}
    };

    // const preventIndexUsage = (hasAssetFilter(params) || hasDataFilters(params) || hasListingFilter(params)) && sortMapping[args.sort].numericIndex;

    query.append(`ORDER BY ${sortMapping[args.sort].column} ${args.order} ${(sortMapping[args.sort].nullable ? 'NULLS LAST' : '')}, listing.sale_id ASC`);
    query.paginate(args.page, args.limit);

    const saleQuery = await ctx.db.query(query.buildString(), query.buildValues());

    const result = await ctx.db.query(`
            SELECT * FROM atomicmarket_sales_master m
                JOIN UNNEST($2::BIGINT[]) WITH ORDINALITY AS f(sale_id) ON m.sale_id = f.sale_id
            WHERE market_contract = $1
            ORDER BY f.ordinality`,
        [ctx.coreArgs.atomicmarket_account, saleQuery.rows.map(row => row.sale_id)]
    );

    return await fillSales(
        ctx.db, ctx.coreArgs.atomicassets_account, result.rows.map(formatSale)
    );

}

export async function getSalesCountV2Action(params: RequestValues, ctx: AtomicMarketContext): Promise<any> {
    return await getSalesV2Action({...params, count: 'true'}, ctx);
}

async function buildSaleFilterV2(values: FilterValues, query: QueryBuilder, ctx: AtomicMarketContext): Promise<void> {
    const args = filterQueryArgs(values, {
        state: {type: 'string', min: 1},

        max_assets: {type: 'int', min: 1},
        min_assets: {type: 'int', min: 1},

        symbol: {type: 'string', min: 1},
        min_price: {type: 'float', min: 0},
        max_price: {type: 'float', min: 0}
    });

    // buildListingFilter(values, query);
    //
    // if (hasAssetFilter(values, ['collection_name']) || hasDataFilters(values)) {
    //     const assetQuery = new QueryBuilder(
    //         'SELECT * FROM atomicassets_offers_assets offer_asset, ' +
    //         'atomicassets_assets asset LEFT JOIN atomicassets_templates "template" ON ("asset".contract = "template".contract AND "asset".template_id = "template".template_id)',
    //         query.buildValues()
    //     );
    //
    //     assetQuery.join('asset', 'offer_asset', ['contract', 'asset_id']);
    //     assetQuery.addCondition(  'offer_asset.offer_id = listing.offer_id AND offer_asset.contract = listing.assets_contract');
    //
    //     buildAssetFilter(values, assetQuery, {assetTable: '"asset"', templateTable: '"template"', allowDataFilter: true});
    //
    //     query.addCondition('EXISTS(' + assetQuery.buildString() + ')');
    //     query.setVars(assetQuery.buildValues());
    // }

    if (args.max_assets) {
        query.addCondition(`listing.asset_count <= ${args.max_assets}`);
    }

    if (args.min_assets) {
        query.addCondition(`listing.asset_count >= ${args.min_assets}`);
    }

    if (args.symbol) {
        query.equal('listing.settlement_symbol', args.symbol);

        const {token_precision} = (await ctx.db.query('SELECT token_precision FROM atomicmarket_tokens WHERE market_contract = $1 AND token_symbol = $2', [ctx.coreArgs.atomicmarket_account, args.symbol])).rows[0];

        if (args.min_price) {
            query.addCondition(`listing.price >= 1.0 * ${query.addVariable(args.min_price)} * POWER(10, ${query.addVariable(token_precision)})`);
        }

        if (args.max_price) {
            query.addCondition(`listing.price <= 1.0 * ${query.addVariable(args.max_price)} * POWER(10, ${query.addVariable(token_precision)})`);
        }
    } else if (args.min_price || args.max_price) {
        throw new ApiError('Price range filters require the "symbol" filter');
    }

    if (args.state?.length) {
        query.equalMany('listing.sale_state', args.state.split(',').map((state: string) => parseInt(state, 10)));
    }
}
