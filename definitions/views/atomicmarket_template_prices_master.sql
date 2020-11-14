CREATE OR REPLACE VIEW atomicmarket_template_prices_master AS
    SELECT
        t2.market_contract, t2.assets_contract, t2.collection_name, t2.template_id, t2.symbol,
        PERCENTILE_DISC(0.5) WITHIN GROUP (ORDER BY t2.price) median,
        AVG(t2.price)::bigint average,
        PERCENTILE_DISC(0.5) WITHIN GROUP (ORDER BY t2.price) FILTER (WHERE t2.number <= 5 OR t2."time" / 1000 >= extract(epoch from now()) - 3600 * 24 * 7) suggested_median,
        (AVG(t2.price) FILTER (WHERE t2.number <= 5 OR t2."time" / 1000 >= extract(epoch from now()) - 3600 * 24 * 7))::bigint suggested_average,
        MIN(t2.price) "min", MAX(t2.price) "max", COUNT(*) sales
    FROM (
        SELECT
            t1.*, row_number() OVER (PARTITION BY t1.assets_contract, t1.collection_name, t1.template_id ORDER BY t1."time" DESC) "number"
        FROM (
            (
                SELECT
                    sale.market_contract, MIN(asset.contract) assets_contract,
                    sale.collection_name, MIN(asset.template_id) template_id,
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
                    auction.market_contract, MIN(asset.contract) assets_contract,
                    auction.collection_name, MIN(asset.template_id) template_id,
                    auction.token_symbol symbol, auction.price, (auction.end_time * 1000) "time"
                FROM
                    atomicassets_assets asset, atomicmarket_auctions_assets auction_asset, atomicmarket_auctions auction
                WHERE
                    auction.assets_contract = auction_asset.assets_contract AND auction.auction_id = auction_asset.auction_id AND
                    auction_asset.assets_contract = asset.contract AND auction_asset.asset_id = asset.asset_id AND
                    asset.template_id IS NOT NULL AND auction.buyer IS NOT NULL AND auction.state = 1 AND auction.end_time < extract(epoch from now())
                GROUP BY auction.market_contract, auction.auction_id
                HAVING COUNT(*) = 1
            )
        ) t1
    ) t2
    GROUP BY t2.market_contract, t2.assets_contract, t2.collection_name, t2.template_id, t2.symbol
