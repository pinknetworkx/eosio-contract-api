CREATE MATERIALIZED VIEW IF NOT EXISTS atomicmarket_buyoffer_stats AS
    SELECT
        buyoffer.market_contract, buyoffer.buyoffer_id,
        SUM(price.suggested_average) suggested_average, SUM(price.suggested_median) suggested_median,
        SUM(price.average) average, SUM(price.median) median,
        MIN(price.sales) sales
    FROM atomicmarket_buyoffers buyoffer, atomicmarket_buyoffers_assets buyoffer_asset, atomicassets_assets asset, atomicmarket_template_prices price
    WHERE buyoffer.market_contract = buyoffer_asset.market_contract AND buyoffer.buyoffer_id = buyoffer_asset.buyoffer_id AND
        buyoffer_asset.assets_contract = asset.contract AND buyoffer_asset.asset_id = asset.asset_id AND
        price.market_contract = buyoffer.market_contract AND price.assets_contract = asset.contract AND
        price.collection_name = asset.collection_name AND price.template_id = asset.template_id AND price.symbol = buyoffer.token_symbol
    GROUP BY buyoffer.market_contract, buyoffer.buyoffer_id;

CREATE UNIQUE INDEX atomicmarket_buyoffer_stats_pkey ON atomicmarket_buyoffer_stats (market_contract, buyoffer_id);

CREATE INDEX atomicmarket_buyoffer_stats_contract ON atomicmarket_buyoffer_stats USING btree (market_contract);
CREATE INDEX atomicmarket_buyoffer_stats_buyoffer_id ON atomicmarket_buyoffer_stats USING btree (buyoffer_id);
CREATE INDEX atomicmarket_buyoffer_stats_suggested_average ON atomicmarket_buyoffer_stats USING btree (suggested_average);
CREATE INDEX atomicmarket_buyoffer_stats_suggested_median ON atomicmarket_buyoffer_stats USING btree (suggested_median);
CREATE INDEX atomicmarket_buyoffer_stats_average ON atomicmarket_buyoffer_stats USING btree (average);
CREATE INDEX atomicmarket_buyoffer_stats_median ON atomicmarket_buyoffer_stats USING btree (median);
