CREATE MATERIALIZED VIEW IF NOT EXISTS atomicmarket_stats_markets AS
    SELECT * FROM atomicmarket_stats_markets_master;

CREATE UNIQUE INDEX atomicmarket_stats_markets_pkey ON atomicmarket_stats_markets (market_contract, listing_type, listing_id);

CREATE INDEX atomicmarket_stats_markets_collection_name ON atomicmarket_stats_markets USING btree (collection_name);
CREATE INDEX atomicmarket_stats_markets_maker_marketplace ON atomicmarket_stats_markets USING btree (maker_marketplace);
CREATE INDEX atomicmarket_stats_markets_taker_marketplace ON atomicmarket_stats_markets USING btree (taker_marketplace);
CREATE INDEX atomicmarket_stats_markets_symbol ON atomicmarket_stats_markets USING btree (symbol);
CREATE INDEX atomicmarket_stats_markets_price ON atomicmarket_stats_markets USING btree (price);
CREATE INDEX atomicmarket_stats_markets_time ON atomicmarket_stats_markets USING btree ("time");
