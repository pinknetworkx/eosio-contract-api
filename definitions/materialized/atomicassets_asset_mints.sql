CREATE MATERIALIZED VIEW IF NOT EXISTS atomicassets_asset_mints AS
    SELECT * FROM atomicassets_asset_mints_master;

CREATE UNIQUE INDEX atomicassets_asset_mints_pkey ON atomicassets_asset_mints (contract, asset_id);

CREATE INDEX atomicassets_asset_mints_contract ON atomicassets_asset_mints USING btree (contract);
CREATE INDEX atomicassets_asset_mints_asset_id ON atomicassets_asset_mints USING btree (asset_id);
CREATE INDEX atomicassets_asset_mints_template_mint ON atomicassets_asset_mints USING btree (template_mint);
CREATE INDEX atomicassets_asset_mints_schema_mint ON atomicassets_asset_mints USING btree (schema_mint);
CREATE INDEX atomicassets_asset_mints_collection_mint ON atomicassets_asset_mints USING btree (collection_mint);
