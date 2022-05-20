export type EraseAuctionActionData = {
    auction_id: string
};

export type AuctionBidActionData = {
    bidder: string,
    auction_id: string,
    bid_amount: string,
    marketplace: string,
    security_check?: any,
};

export type LogNewAuctionActionData = {
    auction_id: string,
    seller: string,
    auction_type: number,
    collection_name: string,
    collection_fee: string,
    asset_ids: string[],
    min_price: string,
    buy_now_price: string,
    discount_rate: number,
    discount_interval: number,
    start_time: number,
    end_time: number,
    security_id: number,
    marketplace: string,
};

export type ClaimAssetsActionData = {
    auction_id: string
};

export type ClaimWinBidActionData = {
    auction_id: string
};
