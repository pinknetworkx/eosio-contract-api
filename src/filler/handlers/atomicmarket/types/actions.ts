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

export type AuctionClaimBuyActionData = {
    auction_id: string
};

export type AuctionClaimSelActionData = {
    auction_id: string
};

export type LogNewSaleActionData = {
    sale_id: string,
    seller: string,
    asset_ids: string[],
    listing_price: string,
    settlement_symbol: string,
    maker_marketplace: string
};

export type LogNewAuctionActionData = {
    auction_id: string,
    seller: string,
    asset_ids: string[],
    starting_bid: string,
    duration: number,
    maker_marketplace: string
};
