CREATE OR REPLACE VIEW atomicmarket_stats_markets_master AS
    SELECT *
    FROM (
        (
            SELECT
                sale.market_contract, 'sale' listing_type, sale.sale_id listing_id,
                sale.assets_contract,
                sale.collection_name, sale.maker_marketplace, sale.taker_marketplace,
                sale.settlement_symbol symbol, sale.final_price price, sale.updated_at_time "time"
            FROM atomicmarket_sales sale
            WHERE sale.final_price IS NOT NULL AND sale.state = 3
        ) UNION ALL (
            SELECT
                auction.market_contract, 'auction' listing_type, auction.auction_id listing_id,
                auction.assets_contract,
                auction.collection_name, auction.maker_marketplace, auction.taker_marketplace,
                auction.token_symbol symbol, auction.price, (auction.end_time * 1000) "time"
            FROM atomicmarket_auctions auction
            WHERE auction.buyer IS NOT NULL AND auction.state = 1 AND auction.end_time < extract(epoch from now())
        ) UNION ALL (
            SELECT
                buyoffer.market_contract, 'buyoffer' listing_type, buyoffer.buyoffer_id listing_id,
                buyoffer.assets_contract,
                buyoffer.collection_name, buyoffer.maker_marketplace, buyoffer.taker_marketplace,
                buyoffer.token_symbol symbol, buyoffer.price, buyoffer.updated_at_time "time"
            FROM atomicmarket_buyoffers buyoffer
            WHERE buyoffer.state = 3
        )
    ) t1
