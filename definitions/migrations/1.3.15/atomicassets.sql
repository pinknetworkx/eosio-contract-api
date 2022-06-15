/*
-- Run before upgrade to make the migration faster:
CREATE INDEX CONCURRENTLY IF NOT EXISTS atomicassets_transfers_accounts ON atomicassets_transfers USING gin((sender || e'\n' || recipient) gin_trgm_ops);

*/

CREATE INDEX IF NOT EXISTS atomicassets_transfers_accounts ON atomicassets_transfers USING gin((sender || e'\n' || recipient) gin_trgm_ops);

ALTER TABLE atomicassets_schemas ADD COLUMN IF NOT EXISTS has_owned_assets BOOLEAN;

UPDATE atomicassets_schemas "schema"
    SET has_owned_assets = TRUE
WHERE has_owned_assets IS DISTINCT FROM TRUE
    AND (contract, collection_name, schema_name) IN (
        SELECT DISTINCT contract, collection_name, schema_name FROM atomicassets_assets asset
        WHERE "owner" IS NOT NULL
            AND asset.updated_at_time < (SELECT MAX(block_time) FROM contract_readers)  - 5 * 60 * 1000 -- 5 minutes
    )
;
