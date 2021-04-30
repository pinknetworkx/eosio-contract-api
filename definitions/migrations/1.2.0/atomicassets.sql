DROP MATERIALIZED VIEW IF EXISTS atomicassets_asset_data;
DROP FUNCTION IF EXISTS remove_long_jsonb_pairs;

-- TODO add to base tables
ALTER TABLE atomicassets_assets ADD COLUMN IF NOT EXISTS template_mint INT;

CREATE INDEX  IF NOT EXISTS atomicassets_assets_missing_mint ON atomicassets_assets(template_id, asset_id) WHERE template_id IS NOT NULL AND template_mint IS NULL;

DROP INDEX IF EXISTS atomicassets_assets_template_id;

CREATE INDEX IF NOT EXISTS atomicassets_assets_template_id_asset_id on atomicassets_assets (template_id, asset_id);

CREATE INDEX atomicassets_assets_mutable_data ON atomicassets_assets USING gin (mutable_data);
CREATE INDEX atomicassets_assets_immutable_data ON atomicassets_assets USING gin (immutable_data);
