import { formatAsset } from '../atomicassets/format';
import { AuctionState, SaleState } from '../../../filler/handlers/atomicmarket';
import { AuctionApiState, SaleApiState } from './index';
import { OfferState } from '../../../filler/handlers/atomicassets';

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
