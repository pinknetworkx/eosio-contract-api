CREATE MATERIALIZED VIEW IF NOT EXISTS atomicmarket_sale_stats AS
    SELECT
        sale.market_contract, sale.sale_id,
        SUM(price.suggested_average) suggested_average, SUM(price.suggested_median) suggested_median,
        SUM(price.average) average, SUM(price.median) median
    FROM atomicmarket_sales sale, atomicassets_offers offer, atomicassets_offers_assets offer_asset, atomicassets_assets asset, atomicmarket_template_prices price
    WHERE sale.assets_contract = offer.contract AND sale.offer_id = offer.offer_id AND
        offer.contract = offer_asset.contract AND offer.offer_id = offer_asset.offer_id AND
        offer_asset.contract = asset.contract AND offer_asset.asset_id = asset.asset_id AND
        price.market_contract = sale.market_contract AND price.assets_contract = asset.contract AND
        price.collection_name = asset.collection_name AND price.template_id = asset.template_id AND price.symbol = sale.settlement_symbol
    GROUP BY sale.market_contract, sale.sale_id;

CREATE UNIQUE INDEX atomicmarket_sale_stats_pkey ON atomicmarket_sale_stats (market_contract, sale_id);

CREATE INDEX atomicmarket_sale_stats_contract ON atomicmarket_sale_stats USING btree (market_contract);
CREATE INDEX atomicmarket_sale_stats_sale_id ON atomicmarket_sale_stats USING btree (sale_id);
CREATE INDEX atomicmarket_sale_stats_suggested_average ON atomicmarket_sale_stats USING btree (suggested_average);
CREATE INDEX atomicmarket_sale_stats_suggested_median ON atomicmarket_sale_stats USING btree (suggested_median);
CREATE INDEX atomicmarket_sale_stats_average ON atomicmarket_sale_stats USING btree (average);
CREATE INDEX atomicmarket_sale_stats_median ON atomicmarket_sale_stats USING btree (median);
