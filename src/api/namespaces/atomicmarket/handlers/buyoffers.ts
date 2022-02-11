import { buildBoundaryFilter, RequestValues } from '../../utils';
import { AtomicMarketContext } from '../index';
import QueryBuilder from '../../../builder';
import { buildBuyofferFilter, hasListingFilter } from '../utils';
import { buildGreylistFilter, hasAssetFilter, hasDataFilters } from '../../atomicassets/utils';
import { fillBuyoffers } from '../filler';
import { formatBuyoffer } from '../format';
import { ApiError } from '../../../error';
import { applyActionGreylistFilters, getContractActionLogs } from '../../../utils';
import { filterQueryArgs } from '../../validation';

export async function getBuyOffersAction(params: RequestValues, ctx: AtomicMarketContext): Promise<any> {
    const maxLimit = ctx.coreArgs.limits?.buyoffers || 100;
    const args = filterQueryArgs(params, {
        page: {type: 'int', min: 1, default: 1},
        limit: {type: 'int', min: 1, max: maxLimit, default: Math.min(maxLimit, 100)},
        sort: {
            type: 'string',
            allowedValues: [
                'created', 'updated', 'ending', 'buyoffer_id', 'price',
                'template_mint'
            ],
            default: 'created'
        },
        order: {type: 'string', allowedValues: ['asc', 'desc'], default: 'desc'},

        count: {type: 'bool'},
    });

    const query = new QueryBuilder(
        'SELECT listing.buyoffer_id ' +
        'FROM atomicmarket_buyoffers listing ' +
        'JOIN atomicmarket_tokens "token" ON (listing.market_contract = "token".market_contract AND listing.token_symbol = "token".token_symbol)'
    );

    query.equal('listing.market_contract', ctx.coreArgs.atomicmarket_account);
    query.addCondition(
        'NOT EXISTS (' +
        'SELECT * FROM atomicmarket_buyoffers_assets buyoffer_asset ' +
        'WHERE buyoffer_asset.market_contract = listing.market_contract AND buyoffer_asset.buyoffer_id = listing.buyoffer_id AND ' +
        '       NOT EXISTS (SELECT * FROM atomicassets_assets asset WHERE asset.contract = buyoffer_asset.assets_contract AND asset.asset_id = buyoffer_asset.asset_id)' +
        ')'
    );

    buildBuyofferFilter(params, query);
    buildGreylistFilter(params, query, {collectionName: 'listing.collection_name'});
    buildBoundaryFilter(
        params, query, 'listing.buyoffer_id', 'int',
        args.sort === 'updated' ? 'listing.updated_at_time' : 'listing.created_at_time'
    );

    if (args.count) {
        const countQuery = await ctx.db.query(
            'SELECT COUNT(*) counter FROM (' + query.buildString() + ') x',
            query.buildValues()
        );

        return countQuery.rows[0].counter;
    }

    const sortMapping: {[key: string]: {column: string, nullable: boolean, numericIndex: boolean}} = {
        buyoffer_id: {column: 'listing.buyoffer_id', nullable: false, numericIndex: true},
        created: {column: 'listing.created_at_time', nullable: false, numericIndex: true},
        updated: {column: 'listing.updated_at_time', nullable: false, numericIndex: true},
        price: {column: 'listing.price', nullable: false, numericIndex: false},
        template_mint: {column: 'LOWER(listing.template_mint)', nullable: true, numericIndex: false}
    };

    const ignoreIndex = (hasAssetFilter(params) || hasDataFilters(params) || hasListingFilter(params)) && sortMapping[args.sort].numericIndex;

    query.append('ORDER BY ' + sortMapping[args.sort].column + (ignoreIndex ? ' + 1 ' : ' ') + args.order + ' ' + (sortMapping[args.sort].nullable ? 'NULLS LAST' : '') + ', listing.buyoffer_id ASC');
    query.paginate(args.page, args.limit);

    const buyofferResult = await ctx.db.query(query.buildString(), query.buildValues());

    const buyofferLookup: {[key: string]: any} = {};
    const result = await ctx.db.query(
        'SELECT * FROM atomicmarket_buyoffers_master WHERE market_contract = $1 AND buyoffer_id = ANY ($2)',
        [ctx.coreArgs.atomicmarket_account, buyofferResult.rows.map(row => row.buyoffer_id)]
    );

    result.rows.reduce((prev, current) => {
        prev[String(current.buyoffer_id)] = current;

        return prev;
    }, buyofferLookup);

    const buyoffers = await fillBuyoffers(
        ctx.db, ctx.coreArgs.atomicassets_account,
        buyofferResult.rows.map((row) => buyofferLookup[String(row.buyoffer_id)])
    );

    return buyoffers.map(formatBuyoffer);
}

export async function getBuyOffersCountAction(params: RequestValues, ctx: AtomicMarketContext): Promise<any> {
    return getBuyOffersAction({...params, count: 'true'}, ctx);
}

export async function getBuyOfferAction(params: RequestValues, ctx: AtomicMarketContext): Promise<any> {
    const query = await ctx.db.query(
        'SELECT * FROM atomicmarket_buyoffers_master WHERE market_contract = $1 AND buyoffer_id = $2',
        [ctx.coreArgs.atomicmarket_account, ctx.pathParams.buyoffer_id]
    );

    if (query.rowCount === 0) {
        throw new ApiError('Buyoffer not found', 416);
    }

    const buyoffers = await fillBuyoffers(
        ctx.db, ctx.coreArgs.atomicassets_account, query.rows
    );

    return formatBuyoffer(buyoffers[0]);
}

export async function getBuyOfferLogsAction(params: RequestValues, ctx: AtomicMarketContext): Promise<any> {
    const maxLimit = ctx.coreArgs.limits?.logs || 100;
    const args = filterQueryArgs(params, {
        page: {type: 'int', min: 1, default: 1},
        limit: {type: 'int', min: 1, max: maxLimit, default: Math.min(maxLimit, 100)},
        order: {type: 'string', allowedValues: ['asc', 'desc'], default: 'asc'}
    });

    return await getContractActionLogs(
        ctx.db, ctx.coreArgs.atomicmarket_account,
        applyActionGreylistFilters(['lognewbuyo', 'cancelbuyo', 'acceptbuyo', 'declinebuyo'], args),
        {buyoffer_id: ctx.pathParams.buyoffer_id},
        (args.page - 1) * args.limit, args.limit, args.order
    );
}
