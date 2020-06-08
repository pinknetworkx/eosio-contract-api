CREATE OR REPLACE VIEW atomicmarket_auctions_master AS
    SELECT DISTINCT ON (market_contract, auction_id)
        auction.market_contract,
        auction.auction_id,
        auction.seller,
        auction.asset_contract,
        auction.offer_id,

        auction.price raw_price,
        auction.token_symbol raw_symbol,
        json_build_object(
            'token_contract', symbol.token_contract,
            'token_symbol', symbol.token_symbol,
            'token_precision', symbol.token_precision,
            'amount', auction.price
        ) price,

        ARRAY(
            SELECT asset.asset_id
            FROM atomicassets_offers_assets asset
            WHERE auction.asset_contract = asset.contract AND asset.offer_id = auction.offer_id
        ) assets,

        ARRAY(
            SELECT
                json_build_object(
                    'number', bid.bid_number,
                    'account', bid.account,
                    'amount', bid.amount,
                    'created_at_block', bid.created_at_block,
                    'created_at_time', bid.created_at_time
                )
            FROM atomicmarket_auctions_bids bid
            WHERE bid.market_contract = auction.market_contract AND bid.auction_id = auction.auction_id
        ) bids,

        auction.maker_marketplace,
        auction.taker_marketplace,
        auction.collection_fee,

        auction.state auction_state,
        offer.state offer_state,

        auction.updated_at_block,
        auction.updated_at_time,
        auction.created_at_block,
        auction.created_at_time
    FROM atomicmarket_auctions auction, atomicassets_offers offer, atomicmarket_token_symbols symbol
    WHERE auction.asset_contract = offer.contract AND auction.offer_id = offer.offer_id AND
        auction.market_contract = symbol.market_contract AND auction.token_symbol = symbol.token_symbol
