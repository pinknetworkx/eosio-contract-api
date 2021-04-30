CREATE MATERIALIZED VIEW IF NOT EXISTS atomicmarket_sale_prices AS
    SELECT * FROM atomicmarket_sale_prices_master;

CREATE UNIQUE INDEX atomicmarket_sale_prices_pkey ON atomicmarket_sale_prices (market_contract, sale_id);

CREATE INDEX atomicmarket_sale_prices_sale_id ON atomicmarket_sale_prices USING btree (sale_id);
CREATE INDEX atomicmarket_sale_prices_price ON atomicmarket_sale_prices USING btree (price);
CREATE INDEX atomicmarket_sale_prices_state ON atomicmarket_sale_prices USING btree (state);
