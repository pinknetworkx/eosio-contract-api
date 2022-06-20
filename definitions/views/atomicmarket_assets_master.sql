CREATE OR REPLACE VIEW atomicmarket_assets_master AS
    SELECT
        asset.*,
        ARRAY(
            SELECT
                json_build_object(
                    'market_contract', sale.market_contract,
                    'sale_id', sale.sale_id
                )
            FROM atomicmarket_sales sale, atomicassets_offers offer, atomicassets_offers_assets offer_asset
            WHERE sale.assets_contract = offer.contract AND sale.offer_id = offer.offer_id AND
                offer.contract = offer_asset.contract AND offer.offer_id = offer_asset.offer_id AND
                offer_asset.contract = asset.contract AND offer_asset.asset_id = asset.asset_id AND
                offer.state = 0 AND sale.state = 1
        ) sales,
        ARRAY(
            SELECT
                json_build_object(
                    'market_contract', auction.market_contract,
                    'auction_id', auction.auction_id
                )
            FROM atomicmarket_auctions auction, atomicmarket_auctions_assets auction_asset
            WHERE auction.market_contract = auction_asset.market_contract AND auction.auction_id = auction_asset.auction_id AND
                auction_asset.assets_contract = asset.contract AND auction_asset.asset_id = asset.asset_id AND
                auction.state = 1 AND auction.end_time > (extract(epoch from now()) * 1000)::bigint
        ) auctions
    FROM atomicassets_assets_master asset
