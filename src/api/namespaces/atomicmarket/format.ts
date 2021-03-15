import { formatAsset } from '../atomicassets/format';
import { AuctionState, BuyofferState, SaleState } from '../../../filler/handlers/atomicmarket';
import { AuctionApiState, BuyofferApiState, SaleApiState } from './index';
import { OfferState } from '../../../filler/handlers/atomicassets';
import { HTTPServer } from '../../server';

export function formatAuction(row: any): any {
    const data = {...row};

    data.price.amount = row.raw_price;

    if (row.auction_state === AuctionState.WAITING.valueOf()) {
        data.state = AuctionApiState.WAITING.valueOf();
    } else if (row.auction_state === AuctionState.LISTED.valueOf() && row.end_time > Date.now() / 1000) {
        data.state = AuctionApiState.LISTED.valueOf();
    } else if (row.auction_state === AuctionState.CANCELED.valueOf()) {
        data.state = AuctionApiState.CANCELED.valueOf();
    } else if (row.auction_state === AuctionState.LISTED.valueOf() && row.end_time <= Date.now() / 1000 && row.buyer !== null) {
        data.state = AuctionApiState.SOLD.valueOf();
    } else {
        data.state = AuctionApiState.INVALID.valueOf();
    }

    data.end_time = String(data.end_time * 1000);

    delete data.raw_price;
    delete data.raw_token_symbol;
    delete data.raw_token_precision;
    delete data.collection_name;
    delete data.auction_state;

    return data;
}

export function formatBuyoffer(row: any): any {
    const data = {...row};

    data.price.amount = row.raw_price;

    if (row.buyoffer_state === BuyofferState.PENDING.valueOf() && !data.assets.find((asset: any) => asset.owner !== row.seller)) {
        data.state = BuyofferApiState.PENDING.valueOf();
    } else if (row.buyoffer_state === BuyofferState.DECLINED.valueOf()) {
        data.state = BuyofferApiState.DECLINED.valueOf();
    } else if (row.buyoffer_state === BuyofferState.CANCELED.valueOf()) {
        data.state = BuyofferApiState.CANCELED.valueOf();
    } else if (row.buyoffer_state === BuyofferState.ACCEPTED.valueOf()) {
        data.state = BuyofferApiState.ACCEPTED.valueOf();
    } else {
        data.state = BuyofferApiState.INVALID.valueOf();
    }

    delete data.raw_price;
    delete data.raw_token_symbol;
    delete data.raw_token_precision;
    delete data.collection_name;
    delete data.buyoffer_state;

    return data;
}

export function formatSale(row: any): any {
    const data = {...row};

    data.price.amount = row.raw_price;

    if (row.sale_state === SaleState.WAITING.valueOf()) {
        data.state = SaleApiState.WAITING.valueOf();
    } else if (row.sale_state === SaleState.LISTED.valueOf() && row.offer_state === OfferState.PENDING.valueOf()) {
        data.state = SaleApiState.LISTED.valueOf();
    } else if (row.sale_state === SaleState.CANCELED.valueOf()) {
        data.state = SaleApiState.CANCELED.valueOf();
    } else if (row.sale_state === SaleState.SOLD.valueOf()) {
        data.state = SaleApiState.SOLD.valueOf();
    } else {
        data.state = SaleApiState.INVALID.valueOf();
    }

    delete data.raw_price;
    delete data.raw_token_symbol;
    delete data.raw_token_precision;
    delete data.sale_state;
    delete data.offer_state;

    return data;
}

export function formatListingAsset(row: any): any {
    return formatAsset(row);
}

export async function hookAssetFiller(server: HTTPServer, contract: string, rows: any[]): Promise<any[]> {
    const assetIDs = rows.map(asset => asset.asset_id);

    const queries = await Promise.all([
        server.query(
            'SELECT sale.market_contract, sale.sale_id, offer_asset.asset_id ' +
            'FROM atomicmarket_sales sale, atomicassets_offers offer, atomicassets_offers_assets offer_asset ' +
            'WHERE sale.assets_contract = offer.contract AND sale.offer_id = offer.offer_id AND ' +
            'offer.contract = offer_asset.contract AND offer.offer_id = offer_asset.offer_id AND ' +
            'offer_asset.contract = $1 AND offer_asset.asset_id = ANY($2) AND ' +
            'sale.state = ' + SaleState.LISTED.valueOf() + ' AND offer.state = ' + OfferState.PENDING.valueOf(),
            [contract, assetIDs]
        ),
        server.query(
            'SELECT auction.market_contract, auction.auction_id, auction_asset.asset_id ' +
            'FROM atomicmarket_auctions auction, atomicmarket_auctions_assets auction_asset ' +
            'WHERE auction.market_contract = auction_asset.market_contract AND auction.auction_id = auction_asset.auction_id AND ' +
            'auction_asset.assets_contract = $1 AND auction_asset.asset_id = ANY($2) AND ' +
            'auction.state = ' + AuctionState.LISTED.valueOf() + ' AND auction.end_time > ' + (Date.now() / 1000),
            [contract, assetIDs]
        ),
        server.query(
            'SELECT DISTINCT ON (price.market_contract, price.collection_name, price.template_id, price.symbol) ' +
                'price.market_contract, asset.collection_name, asset.template_id, ' +
                'token.token_symbol, token.token_precision, token.token_contract, ' +
                'price.median, price.average, price.suggested_median, price.suggested_average, price.min, price.max, price.sales ' +
            'FROM atomicassets_assets asset, atomicmarket_template_prices price, atomicmarket_tokens token ' +
            'WHERE asset.contract = price.assets_contract AND asset.collection_name = price.collection_name AND ' +
                'asset.template_id = price.template_id AND asset.template_id IS NOT NULL AND ' +
                'price.market_contract = token.market_contract AND price.symbol = token.token_symbol AND ' +
                'asset.contract = $1 AND asset.asset_id = ANY($2)',
            [contract, assetIDs]
        )
    ]);

    const assetData: {[key: string]: {sales: any[], auctions: any[]}} = {};
    const templateData: {[key: string]: {prices: any[]}} = {};

    for (const row of rows) {
        assetData[row.asset_id] = {sales: [], auctions: []};
    }

    for (const row of rows) {
        if (!row.template) {
            continue;
        }

        templateData[row.collection.collection_name + ':' + row.template.template_id] = {prices: []};
    }

    for (const row of queries[0].rows) {
        assetData[row.asset_id].sales.push({market_contract: row.market_contract, sale_id: row.sale_id});
    }

    for (const row of queries[1].rows) {
        assetData[row.asset_id].auctions.push({market_contract: row.market_contract, auction_id: row.auction_id});
    }

    for (const row of queries[2].rows) {
        templateData[row.collection_name + ':' + row.template_id].prices.push({
            market_contract: row.market_contract,
            token: {
                token_symbol: row.token_symbol,
                token_precision: row.token_precision,
                token_contract: row.token_contract,
            },
            median: row.median,
            average: row.average,
            suggested_median: row.suggested_median,
            suggested_average: row.suggested_average,
            min: row.min,
            max: row.max,
            sales: row.sales,
        });
    }

    return rows.map(row => {
        const data = row.template ? templateData[row.collection_name + ':' + row.template_id] : {};

        return {...row, ...assetData[row.asset_id], ...data};
    });
}
