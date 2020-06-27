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
            WHERE sale_a.assets_contract = offer_a.contract AND sale_a.offer_id = offer_a.offer_id AND
                offer_a.contract = asset_o.contract AND offer_a.offer_id = asset_o.offer_id AND
                asset_o.contract = asset_a.contract AND asset_o.asset_id = asset_a.asset_id AND
                offer_a.state = 0 AND sale_a.state = 1
        ) sales,
        (
            SELECT
                json_build_object(
                    'market_contract', auction_a.market_contract,
                    'auction_id', auction_a.auction_id
                )
            FROM atomicmarket_auctions auction_a, atomicmarket_auctions_assets asset_o
            WHERE auction_a.market_contract = asset_o.market_contract AND auction_a.auction_id = asset_o.auction_id AND
                asset_o.assets_contract = asset_a.contract AND asset_o.asset_id = asset_a.asset_id AND
                auction_a.state = 1 AND auction_a.end_time <= (extract(epoch from now()) * 1000)::bigint
        ) auction,

        EXISTS (
            SELECT * FROM atomicmarket_blacklist_collections list
            WHERE list.assets_contract = asset_a.contract AND list.collection_name = asset_a.collection_name
        ) collection_blacklisted,
        EXISTS (
            SELECT * FROM atomicmarket_whitelist_collections list
            WHERE list.assets_contract = asset_a.contract AND list.collection_name = asset_a.collection_name
        ) collection_whitelisted
    FROM atomicassets_assets_master asset_a
