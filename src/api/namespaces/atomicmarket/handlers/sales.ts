import { buildBoundaryFilter, RequestValues } from '../../utils';
import { fillSales } from '../filler';
import { formatSale } from '../format';
import { ApiError } from '../../../error';
import { AtomicMarketContext } from '../index';
import { applyActionGreylistFilters, getContractActionLogs } from '../../../utils';
import QueryBuilder from '../../../builder';
import { buildSaleFilter, hasListingFilter } from '../utils';
import { buildGreylistFilter, hasAssetFilter, hasDataFilters } from '../../atomicassets/utils';
import { filterQueryArgs } from '../../validation';

export async function getSaleAction(params: RequestValues, ctx: AtomicMarketContext): Promise<any> {
    const query = await ctx.db.query(
        'SELECT * FROM atomicmarket_sales_master WHERE market_contract = $1 AND sale_id = $2',
        [ctx.coreArgs.atomicmarket_account, ctx.pathParams.sale_id]
    );

    if (query.rowCount === 0) {
        throw new ApiError('Sale not found', 416);
    }

    const sales = await fillSales(
        ctx.db, ctx.coreArgs.atomicassets_account, query.rows.map(formatSale)
    );

    return sales[0];
}

export async function getSaleLogsAction(params: RequestValues, ctx: AtomicMarketContext): Promise<any> {
    const maxLimit = ctx.coreArgs.limits?.logs || 100;
    const args = filterQueryArgs(params, {
        page: {type: 'int', min: 1, default: 1},
        limit: {type: 'int', min: 1, max: maxLimit, default: Math.min(maxLimit, 100)},
        order: {type: 'string', allowedValues: ['asc', 'desc'], default: 'asc'}
    });

    return await getContractActionLogs(
        ctx.db, ctx.coreArgs.atomicmarket_account,
        applyActionGreylistFilters(['lognewsale', 'logsalestart', 'cancelsale', 'purchasesale'], args),
        {sale_id: ctx.pathParams.sale_id},
        (args.page - 1) * args.limit, args.limit, args.order
    );
}

export async function getSalesAction(params: RequestValues, ctx: AtomicMarketContext): Promise<any> {
    const maxLimit = ctx.coreArgs.limits?.sales || 100;
    const args = filterQueryArgs(params, {
        page: {type: 'int', min: 1, default: 1},
        limit: {type: 'int', min: 1, max: maxLimit, default: Math.min(maxLimit, 100)},
        collection_name: {type: 'string', min: 1},
        state: {type: 'string', min: 1},
        sort: {
            type: 'string',
            allowedValues: [
                'created', 'updated', 'sale_id', 'price',
                'template_mint'
            ],
            default: 'created'
        },
        order: {type: 'string', allowedValues: ['asc', 'desc'], default: 'desc'},
        count: {type: 'bool'}
    });

    if (args.sort === 'price') {
        throw new ApiError('Sorting by price removed in /v1/sales, use /v2/sales', 400);
    }

    const query = new QueryBuilder(`
                SELECT listing.sale_id
                FROM atomicmarket_sales listing
                    JOIN atomicassets_offers offer ON (listing.assets_contract = offer.contract AND listing.offer_id = offer.offer_id)
            `);

    query.equal('listing.market_contract', ctx.coreArgs.atomicmarket_account);

    buildSaleFilter(params, query);

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

    const sortMapping: {[key: string]: {column: string, nullable: boolean, numericIndex: boolean}}  = {
        sale_id: {column: 'listing.sale_id', nullable: false, numericIndex: true},
        created: {column: 'listing.created_at_time', nullable: false, numericIndex: true},
        updated: {column: 'listing.updated_at_time', nullable: false, numericIndex: true},
        template_mint: {column: 'LOWER(listing.template_mint)', nullable: true, numericIndex: false}
    };

    const preventIndexUsage = (hasAssetFilter(params) || hasDataFilters(params) || hasListingFilter(params)) && sortMapping[args.sort].numericIndex;

    query.append('ORDER BY ' + sortMapping[args.sort].column + (preventIndexUsage ? ' + 1 ' : ' ') + args.order + ' ' + (sortMapping[args.sort].nullable ? 'NULLS LAST' : '') + ', listing.sale_id ASC');
    query.paginate(args.page, args.limit);

    const saleQuery = await ctx.db.query(query.buildString(), query.buildValues());

    const result = await ctx.db.query(`
            SELECT * FROM atomicmarket_sales_master m
                JOIN UNNEST($2::BIGINT[]) WITH ORDINALITY AS f(sale_id) ON m.sale_id = f.sale_id
            WHERE market_contract = $1
                AND m.sale_id = ANY($2::BIGINT[])
            ORDER BY f.ordinality`,
        [ctx.coreArgs.atomicmarket_account, saleQuery.rows.map(row => row.sale_id)]
    );

    return await fillSales(
        ctx.db, ctx.coreArgs.atomicassets_account, result.rows.map(formatSale)
    );
}

export async function getSalesCountAction(params: RequestValues, ctx: AtomicMarketContext): Promise<any> {
    return await getSalesAction({...params, count: 'true'}, ctx);
}
