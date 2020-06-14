export type AnnounceSaleActionData = {
    seller: string,
    asset_ids: string[],
    listing_price: string,
    settlement_symbol: string,
    maker_marketplace: string
};

export type CancelSaleActionData = {
    sale_id: string
};

export type PurchaseSaleActionData = {
    name: string,
    sale_id: string,
    intended_delphi_median: string,
    taker_marketplace: string
};

export type AnnounceAuctionActionData = {
    seller: string,
    asset_ids: string[],
    starting_bid: string,
    duration: number,
    maker_marketplace: string
};

export type CancelAuctionActionData = {
    auction_id: string
};

export type AuctionBidActionData = {
    bidder: string,
    auction_id: string,
    bid: string,
    taker_marketplace: string
};

export type AuctionClaimBuyerActionData = {
    auction_id: string
};

export type AuctionClaimSellerActionData = {
    auction_id: string
};

export type LogNewSaleActionData = {
    sale_id: string,
    seller: string,
    asset_ids: string[],
    listing_price: string,
    settlement_symbol: string,
    maker_marketplace: string,
    collection_name: string
    collection_fee: number
};

export type LogNewAuctionActionData = {
    auction_id: string,
    seller: string,
    asset_ids: string[],
    starting_bid: string,
    duration: number,
    end_time: number,
    maker_marketplace: string
    collection_name: string
    collection_fee: number
};

export type LogSaleStartActionData = {
    sale_id: string,
    offer_id: string
};

export type LogAuctionStartActionData = {
    auction_id: string
};
