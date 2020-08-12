CREATE OR REPLACE VIEW atomicmarket_assets_master AS
    SELECT
        asset.*,
        ARRAY(
            SELECT
                json_build_object(
                    'market_contract', sale.market_contract,
                    'sale_id', sale.sale_id
                )
            FROM atomicmarket_sales sale, atomicassets_offers offer_a, atomicassets_offers_assets asset_o
            WHERE sale.assets_contract = offer_a.contract AND sale.offer_id = offer_a.offer_id AND
                offer_a.contract = asset_o.contract AND offer_a.offer_id = asset_o.offer_id AND
                asset_o.contract = asset.contract AND asset_o.asset_id = asset.asset_id AND
                offer_a.state = 0 AND sale.state = 1
        ) sales,
        ARRAY(
            SELECT
                json_build_object(
                    'market_contract', auction.market_contract,
                    'auction_id', auction.auction_id
                )
            FROM atomicmarket_auctions auction, atomicmarket_auctions_assets asset_o
            WHERE auction.market_contract = asset_o.market_contract AND auction.auction_id = asset_o.auction_id AND
                asset_o.assets_contract = asset.contract AND asset_o.asset_id = asset.asset_id AND
                auction.state = 1 AND auction.end_time <= (extract(epoch from now()) * 1000)::bigint
        ) auctions
    FROM atomicassets_assets_master asset
