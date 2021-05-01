ALTER TABLE atomicassets_mints DROP COLUMN IF EXISTS created_at_time;
ALTER TABLE atomicassets_mints DROP COLUMN IF EXISTS created_at_block;

DROP INDEX IF EXISTS atomicassets_balances_owner;
DROP INDEX IF EXISTS atomicassets_assets_backed_tokens_token_symbol;
DROP INDEX IF EXISTS atomicassets_asset_mints_schema_mint;
DROP INDEX IF EXISTS atomicassets_asset_mints_collection_mint;

CREATE INDEX IF NOT EXISTS atomicassets_balances_owner_btree ON atomicassets_balances USING btree (owner);
