CREATE
OR REPLACE VIEW neftydrops_attribute_filters_master AS
SELECT DISTINCT t.contract, t.collection_name, t.schema_name, d.key, d.value
FROM
    atomicassets_templates as t,
    jsonb_each(t.immutable_data) as d
WHERE length(d.value::TEXT) < 100 AND length(d.key) < 50;

CREATE MATERIALIZED VIEW IF NOT EXISTS neftydrops_attribute_filters AS
SELECT * FROM neftydrops_attribute_filters_master;

CREATE UNIQUE INDEX neftydrops_attribute_filters_pkey ON neftydrops_attribute_filters (contract, collection_name, schema_name, key, value);

CREATE INDEX neftydrops_attribute_filters_contract ON neftydrops_attribute_filters USING btree (contract);
CREATE INDEX neftydrops_attribute_filters_collection_name ON neftydrops_attribute_filters USING btree (collection_name);
CREATE INDEX neftydrops_attribute_filters_schema_name ON neftydrops_attribute_filters USING btree (schema_name);
CREATE INDEX neftydrops_attribute_filters_key ON neftydrops_attribute_filters USING btree (key);
