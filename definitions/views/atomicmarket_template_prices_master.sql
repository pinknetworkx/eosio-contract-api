CREATE OR REPLACE VIEW atomicmarket_template_prices_master AS
    SELECT
    	sale.market_contract, asset.contract assets_contract, asset.collection_name, asset.template_id,
    	sale.settlement_symbol symbol, PERCENTILE_DISC(0.5) WITHIN GROUP (ORDER BY sale.final_price) median,
    	AVG(sale.final_price)::bigint average, MIN(sale.final_price) "min", MAX(sale.final_price) "max", COUNT(*) sales
    FROM
    	atomicassets_assets asset, atomicassets_offers_assets offer_asset, atomicmarket_sales sale
    WHERE
    	sale.assets_contract = offer_asset.contract AND sale.offer_id = offer_asset.offer_id AND
    	offer_asset.contract = asset.contract AND offer_asset.asset_id = asset.asset_id AND
    	asset.template_id IS NOT NULL AND sale.state = 3
    GROUP BY sale.market_contract, sale.settlement_symbol, asset.contract, asset.collection_name, asset.template_id
