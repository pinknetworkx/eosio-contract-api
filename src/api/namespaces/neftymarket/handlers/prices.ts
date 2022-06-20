import {buildBoundaryFilter, RequestValues} from '../../utils';
import {NeftyMarketContext} from '../index';
import QueryBuilder from '../../../builder';
import {buildAssetQueryCondition} from '../../atomicassets/handlers/assets';
import {filterQueryArgs} from '../../validation';
import {
    ICollectionsMasterView,
    IUserInventoryCollectionsPrices,
    IUserInventoryPriceResponse, IUserInventoryPrices,
    IUserInventoryPricesQueryResponse
} from '../../../../types/models';
import {oneLine} from 'common-tags';

export async function getPricesAction(params: RequestValues, ctx: NeftyMarketContext): Promise<any> {
    const args = filterQueryArgs(params, {
        collection_name: {type: 'string', min: 1},
        template_id: {type: 'string', min: 1},
        schema_name: {type: 'string', min: 1},
        asset_id: {type: 'string', min: 1},
        symbol: {type: 'string', min: 1}
    });

    const query = new QueryBuilder(
        'SELECT price.*, token.token_precision, token.token_contract, asset.template_mint ' +
        'FROM neftymarket_stats_prices_master price, atomicassets_assets asset, neftymarket_tokens token '
    );

    query.equal('price.market_contract', ctx.coreArgs.neftymarket_account);
    query.addCondition(
        'price.assets_contract = asset.contract AND price.asset_id = asset.asset_id AND ' +
        'price.market_contract = token.market_contract AND price.symbol = token.token_symbol'
    );

    if (args.collection_name) {
        query.equalMany('price.collection_name', args.collection_name.split(','));
    }

    if (args.schema_name) {
        query.equalMany('price.schema_name', args.schema_name.split(','));
    }

    if (args.template_id && args.template_id.toLowerCase() !== 'null') {
        query.equalMany('price.template_id', args.template_id.split(','));
    }

    if (args.template_id && args.template_id.toLowerCase() === 'null') {
        query.isNull('price.template_id');
    }

    if (args.asset_id) {
        query.equalMany('price.asset_id', args.asset_id.split(','));
    }

    if (args.symbol) {
        query.equalMany('price.symbol', args.symbol.split(','));
    }

    query.append('ORDER BY price."time" DESC LIMIT 500');

    const result = await ctx.db.query(query.buildString(), query.buildValues());

    return result.rows.map(row => ({
        sale_id: row.listing_type === 'sale' ? row.listing_id : null,
        auction_id: row.listing_type === 'auction' ? row.listing_id : null,
        buyoffer_id: row.listing_type === 'buyoffer' ? row.listing_id : null,
        price: row.price,
        template_mint: row.template_mint,
        token_symbol: row.symbol,
        token_precision: row.token_precision,
        token_contract: row.token_contract,
        block_time: row.time,
    })).reverse();
}

export async function getAssetSalesAction(params: RequestValues, ctx: NeftyMarketContext): Promise<any> {
    const args = filterQueryArgs(params, {
        seller: {type: 'string', min: 1},
        buyer: {type: 'string', min: 1},
        symbol: {type: 'string', min: 1},
        limit: {type: 'int', min: 1, default: 100},
        order: {type: 'string', allowedValues: ['asc', 'desc'], default: 'desc'},
        bundles: {type: 'bool'}
    });

    const query = new QueryBuilder(`
                SELECT * FROM (
                    (
                        SELECT 
                            listing.market_contract, (NULL)::bigint sale_id, listing.auction_id, (NULL)::bigint buyoffer_id,
                            listing.token_symbol, "token".token_precision, "token".token_contract,
                            listing.price, listing.seller, listing.buyer, listing.end_time * block_time
                        FROM neftymarket_auctions listing, neftymarket_auctions_assets asset, neftymarket_tokens "token"
                        WHERE listing.market_contract = asset.market_contract AND listing.auction_id = asset.auction_id
                            AND listing.market_contract = "token".market_contract AND listing.token_symbol = "token".token_symbol
                            AND listing."state" = 1 AND listing.end_time <= extract(epoch from now())::bigint * 1000 AND asset.asset_id = $1
                    )
                ) t1
            `, [ctx.pathParams.asset_id]);

    query.equal('t1.market_contract', ctx.coreArgs.neftymarket_account);

    if (args.symbol) {
        query.equalMany('t1.token_symbol', args.symbol.split(','));
    }

    if (args.seller) {
        query.equalMany('t1.seller', args.seller.split(','));
    }

    if (args.buyer) {
        query.equalMany('t1.buyer', args.buyer.split(','));
    }

    query.append(`ORDER BY t1.block_time ${args.order} LIMIT 500`);

    const result = await ctx.db.query(query.buildString(), query.buildValues());

    return result.rows;
}

export async function getPricesSalesDaysAction(params: RequestValues, ctx: NeftyMarketContext): Promise<any> {
    const args = filterQueryArgs(params, {
        collection_name: {type: 'string', min: 1},
        template_id: {type: 'string', min: 1},
        schema_name: {type: 'string', min: 1},
        asset_id: {type: 'string', min: 1},
        symbol: {type: 'string', min: 1}
    });

    const query = new QueryBuilder(`
                SELECT 
                    (PERCENTILE_DISC(0.5) WITHIN GROUP (ORDER BY price.price))::bigint median, 
                    AVG(price.price)::bigint average,
                    COUNT(*) sales, token.token_symbol, token.token_precision, token.token_contract,
                    (price.time / (3600 * 24 * 1000)) daytime
                FROM neftymarket_stats_prices_master price, neftymarket_tokens token 
            `);

    query.equal('price.market_contract', ctx.coreArgs.neftymarket_account);
    query.addCondition('price.market_contract = token.market_contract AND price.symbol = token.token_symbol');

    if (args.collection_name) {
        query.equalMany('price.collection_name', args.collection_name.split(','));
    }

    if (args.schema_name) {
        query.equalMany('price.schema_name', args.schema_name.split(','));
    }

    if (args.template_id && args.template_id.toLowerCase() !== 'null') {
        query.equalMany('price.template_id', args.template_id.split(','));
    }

    if (args.template_id && args.template_id.toLowerCase() === 'null') {
        query.isNull('price.template_id');
    }

    if (args.asset_id) {
        query.equalMany('price.asset_id', args.asset_id.split(','));
    }

    if (args.symbol) {
        query.equalMany('price.symbol', args.symbol.split(','));
    }

    query.group(['token.market_contract', 'token.token_symbol', 'daytime']);
    query.append('ORDER BY daytime ASC');

    const prices = await ctx.db.query(query.buildString(), query.buildValues());

    return prices.rows.map(row => ({
        median: row.median,
        average: row.average,
        sales: row.sales,
        token_symbol: row.token_symbol,
        token_precision: row.token_precision,
        token_contract: row.token_contract,
        time: row.daytime * 3600 * 24 * 1000 + 3600 * 12 * 1000,
    })).reverse();
}

export async function getPricesTemplatesAction(params: RequestValues, ctx: NeftyMarketContext): Promise<any> {
    const maxLimit = ctx.coreArgs.limits?.prices_templates || 1000;
    const args = filterQueryArgs(params, {
        collection_name: {type: 'string', min: 1},
        template_id: {type: 'string', min: 1},
        schema_name: {type: 'string', min: 1},
        symbol: {type: 'string', min: 1},

        page: {type: 'int', min: 1, default: 1},
        limit: {type: 'int', min: 1, max: maxLimit, default: Math.min(maxLimit, 100)},
    });

    const query = new QueryBuilder(
        'SELECT price.market_contract, price.assets_contract, ' +
        'price.collection_name, price.template_id, ' +
        'token.token_symbol, token.token_contract, token.token_precision, ' +
        'price."median", price."average", price."min", price."max", price.sales, ' +
        'price.suggested_median, price.suggested_average ' +
        'FROM atomicassets_templates "template", neftymarket_template_prices "price", neftymarket_tokens "token" '
    );

    query.equal('"price".market_contract', ctx.coreArgs.neftymarket_account);
    query.equal('"price".assets_contract', ctx.coreArgs.atomicassets_account);
    query.addCondition(
        '"template".contract = "price".assets_contract AND "template".collection_name = "price".collection_name AND "template".template_id = "price".template_id AND ' +
        '"price".market_contract = "token".market_contract AND "price".symbol = "token".token_symbol'
    );

    if (args.collection_name) {
        query.equalMany('price.collection_name', args.collection_name.split(','));
    }

    if (args.schema_name) {
        query.equalMany('"template".schema_name', args.schema_name.split(','));
    }

    if (args.template_id) {
        query.equalMany('price.template_id', args.template_id.split(','));
    }

    if (args.symbol) {
        query.equalMany('price.symbol', args.symbol.split(','));
    }

    query.append('ORDER BY "price".template_id ASC, "price".symbol ASC');
    query.paginate(args.page, args.limit);

    const result = await ctx.db.query(query.buildString(), query.buildValues());

    return result.rows;
}

export async function getPricesAssetsAction(params: RequestValues, ctx: NeftyMarketContext): Promise<any> {
    const query = new QueryBuilder(
        'SELECT token.token_symbol, token.token_precision, token.token_contract, ' +
        'SUM(price."median") "median", SUM(price."average") "average", SUM(price."min") "min", SUM(price."max") "max", ' +
        'SUM(price.suggested_median) suggested_median, SUM(price.suggested_average) suggested_average ' +
        'FROM atomicassets_assets asset, atomicassets_templates "template", neftymarket_template_prices "price", neftymarket_tokens token'
    );

    query.equal('price.assets_contract', ctx.coreArgs.atomicassets_account);
    query.equal('price.market_contract', ctx.coreArgs.neftymarket_account);
    query.addCondition(
        'asset.contract = template.contract AND asset.template_id = template.template_id AND ' +
        'template.contract = price.assets_contract AND template.template_id = price.template_id AND ' +
        'token.market_contract = price.market_contract AND token.token_symbol = price.symbol'
    );

    buildAssetQueryCondition(params, query, {assetTable: '"asset"', templateTable: '"template"'});
    buildBoundaryFilter(params, query, 'asset.asset_id', 'int', null);

    query.append('GROUP BY token.token_symbol, token.token_precision, token.token_contract');

    const result = await ctx.db.query(query.buildString(), query.buildValues());

    return result.rows;
}

export async function getUsersInventoryPrices(params: RequestValues, ctx: NeftyMarketContext): Promise<IUserInventoryPriceResponse> {
    const query = new QueryBuilder(
        oneLine`
      SELECT token.token_symbol, token.token_precision, token.token_contract, asset.collection_name,
        SUM(price."median") "median", SUM(price."average") "average", SUM(price."min") "min", SUM(price."max") "max", 
        SUM(price.suggested_median) suggested_median, SUM(price.suggested_average) suggested_average 
      
      FROM atomicassets_assets asset, atomicassets_templates "template", neftymarket_template_prices "price", neftymarket_tokens token`
    );

    query.equal('price.assets_contract', ctx.coreArgs.atomicassets_account);
    query.equal('price.market_contract', ctx.coreArgs.neftymarket_account);
    query.equal('asset.owner', ctx.pathParams.account);

    query.addCondition(
        oneLine`
      asset.contract = template.contract 
      AND asset.template_id = template.template_id 
      AND template.contract = price.assets_contract 
      AND template.template_id = price.template_id 
      AND token.market_contract = price.market_contract 
      AND token.token_symbol = price.symbol`
    );

    buildAssetQueryCondition(params, query, {assetTable: '"asset"', templateTable: '"template"'});
    buildBoundaryFilter(params, query, 'asset.asset_id', 'int', null);

    query.append('GROUP BY token.token_symbol, token.token_precision, token.token_contract, asset.collection_name');

    const result = await ctx.db.query<IUserInventoryPricesQueryResponse>(query.buildString(), query.buildValues());

    const collections = await ctx.db.query<ICollectionsMasterView>(
        'SELECT * FROM atomicassets_collections_master WHERE contract = $1 AND collection_name = ANY($2)',
        [ctx.coreArgs.atomicassets_account, result.rows.map(row => row.collection_name)]
    );

    return buildUserInventoryPriceResponse(result.rows, collections.rows);
}

function buildUserInventoryPriceResponse(result: IUserInventoryPricesQueryResponse[], collections: ICollectionsMasterView[]): IUserInventoryPriceResponse {
    const response: Record<string, IUserInventoryCollectionsPrices> = {};
    const prices: Record<string, IUserInventoryPrices[]> = {};
    result.map((i) => {
        const { collection_name, ...price } = i;
        prices[collection_name] = prices[collection_name] ?? [];
        prices[collection_name].push(price);
    });
    collections.map((row) => {
        response[row.collection_name] = {collection: row, prices: prices[row.collection_name] || []};
    });

    return {
        collections: Object.values(response)
    };
}
