import { formatAsset } from '../atomicassets/format';
import { AuctionState, SaleState } from '../../../filler/handlers/atomicmarket';
import { AuctionApiState, SaleApiState } from './index';
import { OfferState } from '../../../filler/handlers/atomicassets';
import { HTTPServer } from '../../server';

export function formatAuction(row: any): any {
    const data = {...row};

    data.price.amount = row.raw_price;

    if (row.auction_state === AuctionState.WAITING.valueOf()) {
        data.state = AuctionApiState.WAITING.valueOf();
    } else if (row.auction_state === AuctionState.LISTED.valueOf() && row.end_time > Date.now()) {
        data.state = AuctionApiState.LISTED.valueOf();
    } else if (row.auction_state === AuctionState.CANCELED.valueOf()) {
        data.state = AuctionApiState.CANCELED.valueOf();
    } else if (row.auction_state === AuctionState.LISTED.valueOf() && row.end_time <= Date.now() && row.buyer !== null) {
        data.state = AuctionApiState.SOLD.valueOf();
    } else {
        data.state = AuctionApiState.INVALID.valueOf();
    }

    delete data.raw_price;
    delete data.raw_token_symbol;
    delete data.raw_token_precision;
    delete data.collection_name;
    delete data.auction_state;

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
            'auction_asset.contract = $1 AND auction_asset.asset_ids = ANY($2) AND ' +
            'auction.state = ' + AuctionState.LISTED.valueOf() + ' AND auction.end_time > ' + Date.now(),
            [contract, assetIDs]
        )
    ]);

    const data: {[key: string]: {sales: any[], auctions: any[]}} = {};

    for (const row of rows) {
        data[row.asset_id] = {sales: [], auctions: []};
    }

    for (const row of queries[0].rows) {
        data[row.asset_id].sales.push({market_contract: row.market_contract, sale_id: row.sale_id});
    }

    for (const row of queries[1].rows) {
        data[row.asset_id].auctions.push({market_contract: row.market_contract, auction: row.sale_id});
    }

    return rows.map(row => ({
        ...row, ...data[row.asset_id]
    }));
}
