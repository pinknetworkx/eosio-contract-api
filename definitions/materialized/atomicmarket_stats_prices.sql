CREATE MATERIALIZED VIEW IF NOT EXISTS atomicmarket_stats_prices AS
    SELECT * FROM atomicmarket_stats_prices_master;

CREATE UNIQUE INDEX atomicmarket_stats_prices_pkey ON atomicmarket_stats_prices (market_contract, listing_type, listing_id);

CREATE INDEX atomicmarket_stats_prices_collection_name ON atomicmarket_stats_prices USING btree (collection_name);
CREATE INDEX atomicmarket_stats_prices_template_id ON atomicmarket_stats_prices USING btree (template_id);
CREATE INDEX atomicmarket_stats_prices_symbol ON atomicmarket_stats_prices USING btree (symbol);
CREATE INDEX atomicmarket_stats_prices_price ON atomicmarket_stats_prices USING btree (price);
CREATE INDEX atomicmarket_stats_prices_time ON atomicmarket_stats_prices USING btree ("time");
