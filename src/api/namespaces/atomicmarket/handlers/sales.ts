import { buildBoundaryFilter, RequestValues } from '../../utils';
import { fillSales } from '../filler';
import { formatSale } from '../format';
import { ApiError } from '../../../error';
import { AtomicMarketContext } from '../index';
import { applyActionGreylistFilters, getContractActionLogs } from '../../../utils';
import QueryBuilder from '../../../builder';
import { buildSaleFilter, hasListingFilter } from '../utils';
import { buildAssetFilter, buildGreylistFilter, hasAssetFilter, hasDataFilters } from '../../atomicassets/utils';
import { OfferState } from '../../../../filler/handlers/atomicassets';
import { SaleState } from '../../../../filler/handlers/atomicmarket';
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

    const query = new QueryBuilder(`
                SELECT listing.sale_id
                FROM atomicmarket_sales listing
                    JOIN atomicassets_offers offer ON (listing.assets_contract = offer.contract AND listing.offer_id = offer.offer_id)
                    LEFT JOIN atomicmarket_sale_prices price ON (price.market_contract = listing.market_contract AND price.sale_id = listing.sale_id)
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
        price: {column: args.state === '3' ? 'listing.final_price' : 'price.price', nullable: true, numericIndex: false},
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

export async function getSalesTemplatesAction(params: RequestValues, ctx: AtomicMarketContext): Promise<any> {
    const maxLimit = ctx.coreArgs.limits?.sales_templates || 100;
    const args = filterQueryArgs(params, {
        symbol: {type: 'string', min: 1},
        collection_name: {type: 'string', min: 1},
        collection_whitelist: {type: 'string', min: 1},

        min_price: {type: 'float', min: 0},
        max_price: {type: 'float', min: 0},

        page: {type: 'int', min: 1, default: 1},
        limit: {type: 'int', min: 1, max: maxLimit, default: Math.min(maxLimit, 100)},
        sort: {
            type: 'string',
            allowedValues: ['template_id', 'price'],
            default: 'template_id'
        },
        order: {type: 'string', allowedValues: ['asc', 'desc'], default: 'desc'},
    });

    if (!args.symbol) {
        throw new ApiError('symbol parameter is required', 200);
    }

    if (!hasAssetFilter(params) && !args.collection_whitelist) {
        throw new ApiError('You need to specify an asset filter!', 200);
    }

    const query = new QueryBuilder(`
                SELECT DISTINCT ON(asset.contract, asset.template_id) 
                    sale.market_contract, sale.sale_id, asset.contract assets_contract, asset.template_id, price.price
                FROM 
                    atomicmarket_sales sale, atomicassets_offers offer, atomicassets_offers_assets offer_asset, 
                    atomicassets_assets asset, atomicmarket_sale_prices price, atomicassets_templates "template"
            `);

    query.addCondition(`
                sale.assets_contract = offer.contract AND sale.offer_id = offer.offer_id AND
                offer.contract = offer_asset.contract AND offer.offer_id = offer_asset.offer_id AND
                offer_asset.contract = asset.contract AND offer_asset.asset_id = asset.asset_id AND
                asset.contract = "template".contract AND asset.template_id = "template".template_id AND 
                sale.market_contract = price.market_contract AND sale.sale_id = price.sale_id AND 
                asset.template_id IS NOT NULL AND offer_asset.index = 1 AND 
                offer.state = ${OfferState.PENDING.valueOf()} AND sale.state = ${SaleState.LISTED.valueOf()}
            `);

    query.equal('sale.market_contract', ctx.coreArgs.atomicmarket_account);
    query.equal('sale.settlement_symbol', args.symbol);

    if (!args.collection_name) {
        buildGreylistFilter(params, query, {collectionName: 'sale.collection_name'});
    }

    buildAssetFilter(params, query, {assetTable: '"asset"', templateTable: '"template"'});

    if (args.min_price) {
        query.addCondition('price.price >= ' + query.addVariable(args.min_price) + ' * POW(10, price.settlement_precision)');
    }

    if (args.max_price) {
        query.addCondition('price.price <= ' + query.addVariable(args.max_price) + ' * POW(10, price.settlement_precision)');
    }

    if (args.collection_name) {
        query.equalMany('sale.collection_name', args.collection_name.split(','));
    }

    query.append('ORDER BY asset.contract, asset.template_id, price.price ASC');

    const sortColumnMapping: {[key: string]: string} = {
        price: 't1.price',
        template_id: 't1.template_id',
    };

    let queryString = 'SELECT * FROM (' + query.buildString() + ') t1 ';
    queryString += 'ORDER BY ' + sortColumnMapping[args.sort] + ' ' + args.order + ' NULLS LAST, t1.template_id ASC ';
    queryString += 'LIMIT ' + query.addVariable(args.limit) + ' OFFSET ' + query.addVariable((args.page - 1) * args.limit) + ' ';

    const saleResult = await ctx.db.query(queryString, query.buildValues());

    const result = await ctx.db.query(
        'SELECT * FROM atomicmarket_sales_master WHERE market_contract = $1 AND sale_id = ANY ($2)',
        [ctx.coreArgs.atomicmarket_account, saleResult.rows.map(row => row.sale_id)]
    );

    const saleLookup: {[key: string]: any} = result.rows.reduce((prev, current) => {
        prev[String(current.sale_id)] = current;

        return prev;
    }, {});

    return await fillSales(
        ctx.db, ctx.coreArgs.atomicassets_account, saleResult.rows.map((row) => formatSale(saleLookup[String(row.sale_id)]))
    );
}
