CREATE OR REPLACE VIEW neftymarket_assets_master AS
SELECT asset.*,
       ARRAY(
               SELECT json_build_object(
                              'market_contract', auction.market_contract,
                              'auction_id', auction.auction_id
                          )
               FROM neftymarket_auctions auction,
                    neftymarket_auctions_assets auction_asset
               WHERE auction.market_contract = auction_asset.market_contract
                 AND auction.auction_id = auction_asset.auction_id
                 AND auction_asset.assets_contract = asset.contract
                 AND auction_asset.asset_id = asset.asset_id
                 AND auction.state = 1
                 AND auction.end_time > (extract(epoch from now()) * 1000)::bigint
           ) auctions
FROM atomicassets_assets_master asset
