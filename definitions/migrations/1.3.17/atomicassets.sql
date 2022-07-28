/*
Faster migration:

CREATE INDEX CONCURRENTLY IF NOT EXISTS atomicassets_assets_collection_schema ON atomicassets_assets (collection_name, schema_name);
CREATE INDEX CONCURRENTLY IF NOT EXISTS atomicassets_schemas_collection_schema ON atomicassets_schemas (collection_name, schema_name);
CREATE INDEX CONCURRENTLY IF NOT EXISTS atomicassets_templates_collection_schema ON atomicassets_templates (collection_name, schema_name);

CREATE INDEX CONCURRENTLY IF NOT EXISTS atomicassets_transfers_recipient_transfer_id ON atomicassets_transfers (recipient, transfer_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS atomicassets_transfers_sender_transfer_id ON atomicassets_transfers (sender, transfer_id);

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


CREATE INDEX IF NOT EXISTS atomicassets_transfers_recipient_transfer_id ON atomicassets_transfers (recipient, transfer_id);
CREATE INDEX IF NOT EXISTS atomicassets_transfers_sender_transfer_id ON atomicassets_transfers (sender, transfer_id);

DROP INDEX IF EXISTS atomicassets_transfers_accounts;
DROP INDEX IF EXISTS atomicassets_transfers_sender;
DROP INDEX IF EXISTS atomicassets_transfers_recipient;
