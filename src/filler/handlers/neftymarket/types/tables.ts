export type AuctionsTableRow = {
    auction_id: string,
    seller: string,
    asset_ids: string[],
    auction_type: number,
    current_bid: string,
    min_price: string,
    current_bidder: string,
    collection_name: string,
    collection_fee: number,
    start_time: number,
    end_time: number,
    buy_now_price: string,
    discount_rate: number,
    discount_interval: number,
    claimed_win_bid: boolean,
    claimed_assets: boolean,
    security_id: number,
};

export type ConfigTableRow = {
    market_fee: number,
    min_bid_increase: number,
    last_bid_threshold: number,
    fee_recipient: string,
    supported_tokens: Array<{
        contract: string,
        sym: string
    }>,
};

export type BalancesTableRow = {
    owner: string,
    quantities: string[]
};
