CREATE STATISTICS IF NOT EXISTS atomicassets_assets_collection_schema_template_stat (dependencies) ON collection_name, schema_name, template_id FROM atomicassets_assets;
CREATE STATISTICS IF NOT EXISTS atomicassets_schemas_collection_schema_stat (dependencies) ON collection_name, schema_name FROM atomicassets_schemas;
CREATE STATISTICS IF NOT EXISTS atomicassets_templates_collection_schema_template_stat (dependencies) ON collection_name, schema_name, template_id FROM atomicassets_templates;

ANALYZE atomicassets_assets;
ANALYZE atomicassets_schemas;
ANALYZE atomicassets_templates;
