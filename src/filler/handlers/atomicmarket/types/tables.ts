export type SalesTableRow = {
    sale_id: string,
    seller: string,
    asset_ids: string[],
    offer_id: string,
    listing_price: string,
    settlement_symbol: string,
    maker_marketplace: string,
    collection_fee: number
    collection_name: string
};

export type AuctionsTableRow = {
    auction_id: string,
    seller: string,
    asset_ids: string[],
    end_time: number,
    assets_transferred: boolean,
    current_bid: string,
    current_bidder: string,
    claimed_by_seller: boolean,
    claimed_by_buyer: boolean,
    maker_marketplace: string,
    taker_marketplace: string,
    collection_fee: number,
    collection_name: string
};

export type MarketplacesTableRow = {
    marketplace_name: string,
    creator: string
};

export type ConfigTableRow = {
    sale_counter: number,
    auction_counter: number,
    minimum_bid_increase: number,
    minimum_auction_duration: number,
    maximum_auction_duration: number,
    auction_reset_duration: number,
    supported_tokens: Array<{
        token_contract: string,
        token_symbol: string
    }>,
    supported_symbol_pairs: Array<{
        listing_symbol: string,
        settlement_symbol: string,
        delphi_pair_name: string,
        invert_delphi_pair: boolean
    }>,
    maker_market_fee: number,
    taker_market_fee: number,
    version: string,
    atomicassets_account: string,
    delphioracle_account: string
};

export type BalancesTableRow = {
    owner: string,
    quantities: string[]
};

export type BonusfeesTableRow = {
    bonusfee_id: string,
    fee_name: string,
    fee_recipient: string,
    fee: number,
    counter_ranges: Array<{counter_name: string, start_id: string, end_id: string}>
}

export type BuyoffersTableRow = {
    buyoffer_id: string,
    buyer: string,
    recipient: string,
    price: string,
    asset_ids: string[],
    memo: string,
    maker_marketplace: string,
    collection_name: string,
    collection_fee: number
}
