import { AuctionState } from '../../../filler/handlers/neftymarket';
import { AuctionApiState } from './index';

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
