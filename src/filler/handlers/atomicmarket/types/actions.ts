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
    buyer: string,
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

export type CreateBuyofferActionData = {
    buyer: string,
    recipient: string,
    price: string,
    asset_ids: string[],
    memo: string,
    maker_marketplace: string
}

export type LogNewBuyofferActionData = {
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

export type CancelBuyofferActionData = {
    buyoffer_id: string
}

export type DeclineBuyofferActionData = {
    buyoffer_id: string,
    decline_memo: string
}

export type AcceptBuyofferActionData = {
    buyoffer_id: string,
    expected_asset_ids: string[],
    expected_price: string,
    taker_marketplace: string
}
