CREATE MATERIALIZED VIEW IF NOT EXISTS atomicmarket_sale_prices AS
    SELECT * FROM atomicmarket_sale_prices_master WHERE state NOT IN (2);

CREATE UNIQUE INDEX atomicmarket_sale_prices_pkey ON atomicmarket_sale_prices (market_contract, sale_id);

CREATE INDEX atomicmarket_sale_prices_price ON atomicmarket_sale_prices USING btree (price);
