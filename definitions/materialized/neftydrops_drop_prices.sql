CREATE MATERIALIZED VIEW IF NOT EXISTS neftydrops_drop_prices AS
SELECT * FROM neftydrops_drop_prices_master;

CREATE UNIQUE INDEX neftydrops_drop_prices_pkey ON neftydrops_drop_prices (drops_contract, drop_id);

CREATE INDEX neftydrops_drop_prices_price ON neftydrops_drop_prices USING btree (price);
