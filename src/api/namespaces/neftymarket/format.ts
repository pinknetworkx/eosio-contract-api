import { AuctionState } from '../../../filler/handlers/neftymarket';
import { AuctionApiState } from './index';

export function formatAuction(row: any): any {
    const data = {...row};

    data.price.amount = row.raw_price;

    if (row.auction_state === AuctionState.LISTED.valueOf() && row.start_time > Date.now()) {
        data.state = AuctionApiState.WAITING.valueOf();
    } else if (row.auction_state === AuctionState.LISTED.valueOf() && row.end_time > Date.now()) {
        data.state = AuctionApiState.LISTED.valueOf();
    } else if (row.auction_state === AuctionState.CANCELED.valueOf()) {
        data.state = AuctionApiState.CANCELED.valueOf();
    } else if (row.auction_state === AuctionState.LISTED.valueOf() && row.end_time <= Date.now() && row.buyer !== null) {
        data.state = AuctionApiState.SOLD.valueOf();
    } else if (row.auction_state !== AuctionApiState.SOLD.valueOf()) {
        data.state = AuctionApiState.INVALID.valueOf();
    }

    data.start_time = String(data.start_time);
    data.end_time = String(data.end_time);

    delete data.raw_price;
    delete data.raw_token_symbol;
    delete data.raw_token_precision;
    delete data.collection_name;
    delete data.auction_state;

    return data;
}
