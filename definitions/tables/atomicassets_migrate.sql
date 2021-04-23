CREATE INDEX IF NOT EXISTS atomicassets_transfers_assets_asset_id ON atomicassets_transfers_assets IF EXISTS USING btree (asset_id);
