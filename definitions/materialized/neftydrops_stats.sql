CREATE MATERIALIZED VIEW IF NOT EXISTS neftydrops_stats AS
    SELECT * FROM neftydrops_stats_master;

CREATE UNIQUE INDEX neftydrops_stats_master_pkey ON neftydrops_stats (drops_contract, listing_type, listing_id);

CREATE INDEX neftydrops_stats_master_collection_name ON neftydrops_stats USING btree (collection_name);
CREATE INDEX neftydrops_stats_master_buyer ON neftydrops_stats USING btree (buyer);
CREATE INDEX neftydrops_stats_master_seller ON neftydrops_stats USING btree (seller);
CREATE INDEX neftydrops_stats_master_price ON neftydrops_stats USING btree (price);
CREATE INDEX neftydrops_stats_master_time ON neftydrops_stats USING btree ("time");
