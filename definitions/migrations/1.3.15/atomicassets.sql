/*
-- Run before upgrade to make the migration faster:
CREATE INDEX CONCURRENTLY IF NOT EXISTS atomicassets_transfers_accounts ON atomicassets_transfers USING gin((sender || e'\n' || recipient) gin_trgm_ops);

*/

CREATE INDEX IF NOT EXISTS atomicassets_transfers_accounts ON atomicassets_transfers USING gin((sender || e'\n' || recipient) gin_trgm_ops);



TRUNCATE atomicassets_template_counts;

ALTER TABLE atomicassets_template_counts RENAME TO atomicassets_asset_counts;

DROP INDEX atomicassets_template_counts_contract_template_id;
DROP INDEX atomicassets_template_counts_dirty;

ALTER TABLE atomicassets_asset_counts ADD COLUMN collection_name VARCHAR(12) NOT NULL;
ALTER TABLE atomicassets_asset_counts ADD COLUMN schema_name VARCHAR(12) NOT NULL;

ALTER TABLE atomicassets_asset_counts ALTER COLUMN template_id SET NOT NULL;

INSERT INTO atomicassets_asset_counts(contract, collection_name, schema_name, template_id, assets, burned, owned, dirty)
    SELECT
        contract, collection_name, schema_name, COALESCE(template_id, 0),
        COUNT(*) assets,
        COUNT(*) FILTER (WHERE owner IS NULL) burned,
        COUNT(*) FILTER (WHERE owner IS NOT NULL) AS owned,
        NULL
    FROM atomicassets_assets
    GROUP BY contract, collection_name, schema_name, template_id
;


CREATE INDEX atomicassets_asset_counts_collection_schema_template
	ON atomicassets_asset_counts (contract, collection_name, schema_name, template_id);

CREATE INDEX atomicassets_asset_counts_contract_template_id
	ON atomicassets_asset_counts (contract, template_id);

CREATE INDEX atomicassets_template_counts_dirty
	ON atomicassets_asset_counts (contract, collection_name, schema_name, template_id)
	WHERE dirty;



DROP FUNCTION update_atomicassets_template_counts CASCADE;

CREATE OR REPLACE FUNCTION update_atomicassets_asset_counts() RETURNS TRIGGER AS $$
DECLARE
    update_and_changed BOOLEAN = (TG_OP = 'UPDATE')
        AND (
            OLD.contract IS DISTINCT FROM NEW.contract
            OR OLD.collection_name IS DISTINCT FROM NEW.collection_name
            OR OLD.schema_name IS DISTINCT FROM NEW.schema_name
            OR OLD.template_id IS DISTINCT FROM NEW.template_id
            OR OLD.owner IS DISTINCT FROM NEW.owner
        );
BEGIN
    IF (update_and_changed OR (TG_OP = 'DELETE')) THEN
        INSERT INTO atomicassets_asset_counts (contract, collection_name, schema_name, template_id, assets, burned, owned)
        VALUES (OLD.contract, OLD.collection_name, OLD.schema_name, COALESCE(OLD.template_id, 0), -1, CASE WHEN OLD.owner IS NULL THEN -1 END, CASE WHEN OLD.owner IS NOT NULL THEN -1 END);
    END IF;

    IF (update_and_changed OR (TG_OP = 'INSERT')) THEN
        INSERT INTO atomicassets_asset_counts (contract, collection_name, schema_name, template_id, assets, burned, owned)
        VALUES (NEW.contract, NEW.collection_name, NEW.schema_name, COALESCE(NEW.template_id, 0), 1, CASE WHEN NEW.owner IS NULL THEN 1 END, CASE WHEN NEW.owner IS NOT NULL THEN 1 END);
    END IF;

    RETURN NULL;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_atomicassets_asset_counts_tr ON atomicassets_assets;
CREATE TRIGGER update_atomicassets_asset_counts_tr
    AFTER UPDATE OR INSERT OR DELETE ON atomicassets_assets
    FOR EACH ROW
    EXECUTE FUNCTION update_atomicassets_asset_counts();
