DROP INDEX IF EXISTS atomictools_links_key_type;
DROP INDEX IF EXISTS atomictools_links_key_data;
DROP INDEX IF EXISTS atomictools_links_assets_tools_contract;

CREATE INDEX IF NOT EXISTS atomictools_links_key_full ON atomictools_links USING hash (key_type, key_data);
