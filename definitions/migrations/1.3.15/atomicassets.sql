/*
-- Run before upgrade to make the migration faster:
CREATE INDEX CONCURRENTLY IF NOT EXISTS atomicassets_transfers_accounts ON atomicassets_transfers USING gin((sender || e'\n' || recipient) gin_trgm_ops);

*/

CREATE INDEX IF NOT EXISTS atomicassets_transfers_accounts ON atomicassets_transfers USING gin((sender || e'\n' || recipient) gin_trgm_ops);
