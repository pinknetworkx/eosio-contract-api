/*
Faster migration:

CREATE INDEX IF NOT EXISTS CONCURRENTLY atomicassets_assets_collection_schema ON atomicassets_assets (collection_name, schema_name);
CREATE INDEX IF NOT EXISTS CONCURRENTLY atomicassets_schemas_collection_schema ON atomicassets_schemas (collection_name, schema_name);
CREATE INDEX IF NOT EXISTS CONCURRENTLY atomicassets_templates_collection_schema ON atomicassets_templates (collection_name, schema_name);

*/


CREATE INDEX IF NOT EXISTS atomicassets_assets_collection_schema ON atomicassets_assets (collection_name, schema_name);

DROP INDEX IF EXISTS atomicassets_assets_collection_name_btree;
DROP INDEX IF EXISTS atomicassets_assets_schema_name;


CREATE INDEX IF NOT EXISTS atomicassets_schemas_collection_schema ON atomicassets_schemas (collection_name, schema_name);

DROP INDEX IF EXISTS atomicassets_schemas_collection_name;
DROP INDEX IF EXISTS atomicassets_schemas_schema_name;


CREATE INDEX IF NOT EXISTS atomicassets_templates_collection_schema ON atomicassets_templates (collection_name, schema_name);

DROP INDEX IF EXISTS atomicassets_templates_collection_name;
DROP INDEX IF EXISTS atomicassets_templates_schema_name;
