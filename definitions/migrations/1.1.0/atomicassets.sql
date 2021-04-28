ALTER TABLE IF EXISTS atomicassets_transfers_assets DROP CONSTRAINT IF EXISTS atomicassets_transfers_assets_assets_fkey;
ALTER TABLE IF EXISTS atomicassets_offers_assets DROP CONSTRAINT IF EXISTS atomicassets_offers_assets_assets_fkey;
ALTER TABLE IF EXISTS atomicassets_mints DROP CONSTRAINT IF EXISTS atomicassets_mints_assets_fkey;

DROP INDEX IF EXISTS atomicassets_asset_data_contract;
DROP INDEX IF EXISTS atomicassets_asset_data_name_btree;
DROP INDEX IF EXISTS atomicassets_asset_mints_contract;
DROP INDEX IF EXISTS atomicassets_assets_burned_at_block;
DROP INDEX IF EXISTS atomicassets_assets_collection_name_hash;
DROP INDEX IF EXISTS atomicassets_assets_contract;
DROP INDEX IF EXISTS atomicassets_assets_immutable_data_name;
DROP INDEX IF EXISTS atomicassets_assets_minted_at_block;
DROP INDEX IF EXISTS atomicassets_assets_mutable_data_name;
DROP INDEX IF EXISTS atomicassets_assets_owner_hash;
DROP INDEX IF EXISTS atomicassets_assets_transferred_at_block;
DROP INDEX IF EXISTS atomicassets_assets_updated_at_block;

DROP INDEX IF EXISTS atomicassets_assets_backed_tokens_contract;
DROP INDEX IF EXISTS atomicassets_assets_backed_tokens_updated_at_block;

DROP INDEX IF EXISTS atomicassets_balances_contract;
DROP INDEX IF EXISTS atomicassets_balances_updated_at_block;

DROP INDEX IF EXISTS atomicassets_collections_created_at_block;

DROP INDEX IF EXISTS atomicassets_mints_contract;
DROP INDEX IF EXISTS atomicassets_mints_created_at_block;
DROP INDEX IF EXISTS atomicassets_mints_created_at_time;

DROP INDEX IF EXISTS atomicassets_offers_contract;
DROP INDEX IF EXISTS atomicassets_offers_created_at_block;
DROP INDEX IF EXISTS atomicassets_offers_updated_at_block;

DROP INDEX IF EXISTS atomicassets_offers_assets_contract;

DROP INDEX IF EXISTS atomicassets_schemas_contract;
DROP INDEX IF EXISTS atomicassets_schemas_created_at_block;

DROP INDEX IF EXISTS atomicassets_templates_contract;
DROP INDEX IF EXISTS atomicassets_templates_created_at_block;
DROP INDEX IF EXISTS atomicassets_templates_immutable_data_name;

DROP INDEX IF EXISTS atomicassets_transfers_contract;
DROP INDEX IF EXISTS atomicassets_transfers_created_at_block;

DROP INDEX IF EXISTS atomicassets_transfers_assets_contract;
DROP INDEX IF EXISTS atomicassets_transfers_assets_index;
DROP INDEX IF EXISTS atomicassets_transfers_assets_transfer_id;

CREATE INDEX IF NOT EXISTS atomicassets_transfers_assets_asset_id ON atomicassets_transfers_assets USING btree (asset_id);
