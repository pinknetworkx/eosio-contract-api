ALTER TABLE atomicassets_mints ADD COLUMN IF NOT EXISTS template_mint INT;

-- ALTER TABLE atomicassets_assets DROP COLUMN IF EXISTS template_mint INT;
