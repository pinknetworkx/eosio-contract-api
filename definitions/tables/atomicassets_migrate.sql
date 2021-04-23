-- 1.1.0
CREATE INDEX IF NOT EXISTS atomicassets_transfers_assets_asset_id ON atomicassets_transfers_assets USING btree (asset_id);
