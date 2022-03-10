CREATE INDEX IF NOT EXISTS atomicassets_templates_name ON atomicassets_templates USING GIST ((immutable_data->>'name') gist_trgm_ops);
CREATE INDEX IF NOT EXISTS atomicassets_collections_name ON atomicassets_collections USING GIST ((collection_name || ' ' || COALESCE(data->>'name', '')) gist_trgm_ops);
