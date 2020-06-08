CREATE OR REPLACE VIEW atomicmarket_assets_master AS
    SELECT
        asset_a.*,
        ARRAY(
            SELECT
                json_build_object(
                    'market_contract', sale_a.market_contract,
                    'sale_id', sale_a.sale_id
                )
            FROM atomicmarket_sales sale_a, atomicassets_offers offer_a, atomicassets_offers_assets asset_o
            WHERE sale_a.asset_contract = offer_a.contract AND sale_a.offer_id = offer_a.offer_id AND
                offer_a.contract = asset_o.contract AND offer_a.offer_id = asset_o.offer_id AND
                asset_o.contract = asset_a.contract AND asset_o.asset_id = asset_a.asset_id AND
                offer_a.state = 0 AND sale_a.state = 0
        ) sales,
        ARRAY(
            SELECT
                json_build_object(
                    'market_contract', auction_a.market_contract,
                    'auction_id', auction_a.auction_id
                )
            FROM atomicmarket_auctions auction_a, atomicassets_offers offer_a, atomicassets_offers_assets asset_o
            WHERE auction_a.asset_contract = offer_a.contract AND auction_a.offer_id = offer_a.offer_id AND
                offer_a.contract = asset_o.contract AND offer_a.offer_id = asset_o.offer_id AND
                asset_o.contract = asset_a.contract AND asset_o.asset_id = asset_a.asset_id AND
                offer_a.state = 0 AND auction_a.state = 0
        ) auctions
    FROM atomicassets_assets_master asset_a
