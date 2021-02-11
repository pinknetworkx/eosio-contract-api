CREATE OR REPLACE VIEW atomicmarket_stats_prices_master AS
    SELECT *
    FROM (
        (
            SELECT
                sale.market_contract, 'sale' listing_type, sale.sale_id listing_id,
                sale.assets_contract, sale.collection_name,
                MIN(asset.schema_name) schema_name, MIN(asset.template_id) template_id, MIN(asset.asset_id) asset_id,
                sale.settlement_symbol symbol, sale.final_price price, sale.updated_at_time "time"
            FROM
                atomicassets_assets asset, atomicassets_offers_assets offer_asset, atomicmarket_sales sale
            WHERE
                sale.assets_contract = offer_asset.contract AND sale.offer_id = offer_asset.offer_id AND
                offer_asset.contract = asset.contract AND offer_asset.asset_id = asset.asset_id AND
                asset.template_id IS NOT NULL AND sale.final_price IS NOT NULL AND sale.state = 3
            GROUP BY sale.market_contract, sale.sale_id
            HAVING COUNT(*) = 1
        ) UNION ALL (
            SELECT
                auction.market_contract, 'auction' listing_type, auction.auction_id listing_id,
                auction.assets_contract, auction.collection_name,
                MIN(asset.schema_name) schema_name, MIN(asset.template_id) template_id, MIN(asset.asset_id) asset_id,
                auction.token_symbol symbol, auction.price, (auction.end_time * 1000) "time"
            FROM
                atomicassets_assets asset, atomicmarket_auctions_assets auction_asset, atomicmarket_auctions auction
            WHERE
                auction.assets_contract = auction_asset.assets_contract AND auction.auction_id = auction_asset.auction_id AND
                auction_asset.assets_contract = asset.contract AND auction_asset.asset_id = asset.asset_id AND
                asset.template_id IS NOT NULL AND auction.buyer IS NOT NULL AND auction.state = 1 AND auction.end_time < extract(epoch from now())
            GROUP BY auction.market_contract, auction.auction_id
            HAVING COUNT(*) = 1
        ) UNION ALL (
            SELECT
                buyoffer.market_contract, 'buyoffer' listing_type, buyoffer.buyoffer_id listing_id,
                buyoffer.assets_contract, buyoffer.collection_name,
                MIN(asset.schema_name) schema_name, MIN(asset.template_id) template_id, MIN(asset.asset_id) asset_id,
                buyoffer.token_symbol symbol, buyoffer.price, buyoffer.updated_at_time "time"
            FROM
                atomicassets_assets asset, atomicmarket_buyoffers_assets buyoffer_asset, atomicmarket_buyoffers buyoffer
            WHERE
                buyoffer.assets_contract = buyoffer_asset.assets_contract AND buyoffer.buyoffer_id = buyoffer_asset.buyoffer_id AND
                buyoffer_asset.assets_contract = asset.contract AND buyoffer_asset.asset_id = asset.asset_id AND
                asset.template_id IS NOT NULL AND buyoffer.state = 3
            GROUP BY buyoffer.market_contract, buyoffer.buyoffer_id
            HAVING COUNT(*) = 1
       )
    ) t1
