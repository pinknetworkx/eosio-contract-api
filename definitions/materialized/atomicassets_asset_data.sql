CREATE MATERIALIZED VIEW atomicassets_asset_data AS
    SELECT
        "asset".contract, "asset".asset_id,
    	("asset".mutable_data || asset.immutable_data || COALESCE("template".immutable_data, '{}'::jsonb)) "data"
    FROM
        atomicassets_assets "asset"
    	LEFT JOIN atomicassets_templates "template" ON (
    	    "asset".contract = "template".contract AND "asset".template_id = "template".template_id
    	);

CREATE UNIQUE INDEX atomicassets_asset_data_pkey ON atomicassets_asset_data (contract, asset_id);

CREATE INDEX atomicassets_asset_data_contract ON atomicassets_asset_data USING btree (contract);
CREATE INDEX atomicassets_asset_data_asset_id ON atomicassets_asset_data USING btree (asset_id);

CREATE INDEX atomicassets_asset_data_name_btree ON atomicassets_asset_data USING btree ((data->>'name')) WHERE data->>'name' IS NOT NULL;
CREATE INDEX atomicassets_asset_data_gin ON atomicassets_asset_data USING gin ("data");
