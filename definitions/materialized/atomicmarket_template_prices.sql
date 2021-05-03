CREATE MATERIALIZED VIEW IF NOT EXISTS atomicmarket_template_prices AS
    SELECT * FROM atomicmarket_template_prices_master;

CREATE UNIQUE INDEX atomicmarket_template_prices_pkey ON atomicmarket_template_prices (market_contract, assets_contract, collection_name, template_id, symbol);
CREATE INDEX atomicmarket_template_prices_fkey ON atomicmarket_template_prices (assets_contract, collection_name, template_id);

CREATE INDEX atomicmarket_template_prices_collection_name ON atomicmarket_template_prices USING btree (collection_name);
CREATE INDEX atomicmarket_template_prices_template_id ON atomicmarket_template_prices USING btree (template_id);
CREATE INDEX atomicmarket_template_prices_median ON atomicmarket_template_prices USING btree (median);
CREATE INDEX atomicmarket_template_prices_average ON atomicmarket_template_prices USING btree (average);
CREATE INDEX atomicmarket_template_prices_suggested_median ON atomicmarket_template_prices USING btree (suggested_median);
CREATE INDEX atomicmarket_template_prices_suggested_average ON atomicmarket_template_prices USING btree (suggested_average);
CREATE INDEX atomicmarket_template_prices_min ON atomicmarket_template_prices USING btree ("min");
CREATE INDEX atomicmarket_template_prices_max ON atomicmarket_template_prices USING btree ("max");
CREATE INDEX atomicmarket_template_prices_sales ON atomicmarket_template_prices USING btree (sales);

