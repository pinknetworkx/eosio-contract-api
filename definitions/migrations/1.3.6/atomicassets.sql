CREATE INDEX atomicassets_templates_name ON atomicassets_templates USING GIST ((immutable_data->>'name') gist_trgm_ops);
CREATE INDEX atomicassets_collections_name ON atomicassets_collections USING GIST ((collection_name || ' ' || COALESCE(data->>'name', '')) gist_trgm_ops);
