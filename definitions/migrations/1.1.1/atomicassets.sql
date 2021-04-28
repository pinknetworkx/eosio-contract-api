ALTER TABLE atomicassets_assets ADD COLUMN IF NOT EXISTS template_mint INT;

CREATE INDEX  IF NOT EXISTS atomicassets_assets_missing_mint ON atomicassets_assets(template_id, asset_id) WHERE template_id IS NOT NULL AND template_mint IS NULL;

DROP INDEX IF EXISTS atomicassets_assets_template_id;

CREATE INDEX IF NOT EXISTS atomicassets_assets_template_id_asset_id on atomicassets_assets (template_id, asset_id);
