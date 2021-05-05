DROP PROCEDURE IF EXISTS set_asset_mints;

CREATE INDEX IF NOT EXISTS atomicassets_assets_template_mint ON atomicassets_assets USING btree (template_mint);
