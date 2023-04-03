/*
Faster migration:

CREATE INDEX atomicassets_assets_collection_schema_active ON atomicassets_assets (contract, collection_name, schema_name) INCLUDE (owner) WHERE owner IS NOT NULL;

*/

CREATE INDEX IF NOT EXISTS atomicassets_assets_collection_schema_active ON atomicassets_assets (contract, collection_name, schema_name) INCLUDE (owner) WHERE owner IS NOT NULL;
