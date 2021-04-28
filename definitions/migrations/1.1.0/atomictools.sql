ALTER TABLE IF EXISTS atomictools_links_assets DROP CONSTRAINT IF EXISTS atomictools_links_assets_asset_id_fkey;

CREATE INDEX IF NOT EXISTS atomictools_links_assets_asset_id ON atomictools_links_assets USING btree (asset_id);
