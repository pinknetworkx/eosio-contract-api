DROP MATERIALIZED VIEW IF EXISTS atomicmarket_buyoffer_stats;
DROP MATERIALIZED VIEW IF EXISTS atomicmarket_auction_stats;
DROP MATERIALIZED VIEW IF EXISTS atomicmarket_sale_stats;

ALTER TABLE IF EXISTS atomicassets_transfers_assets DROP CONSTRAINT IF EXISTS atomicassets_transfers_assets_assets_fkey;
ALTER TABLE IF EXISTS atomicassets_offers_assets DROP CONSTRAINT IF EXISTS atomicassets_offers_assets_assets_fkey;
ALTER TABLE IF EXISTS atomicassets_mints DROP CONSTRAINT IF EXISTS atomicassets_mints_assets_fkey;
ALTER TABLE IF EXISTS atomicmarket_auctions_assets DROP CONSTRAINT IF EXISTS atomicmarket_auctions_assets_assets_fkey;
ALTER TABLE IF EXISTS atomictools_links_assets DROP CONSTRAINT IF EXISTS atomictools_links_assets_asset_id_fkey;
ALTER TABLE IF EXISTS atomicmarket_sales DROP CONSTRAINT IF EXISTS atomicmarket_sales_offer_id_fkey;
ALTER TABLE IF EXISTS atomicmarket_buyoffers DROP CONSTRAINT IF EXISTS atomicmarket_buyoffers_collection_name_fkey;
ALTER TABLE IF EXISTS atomicmarket_auctions DROP CONSTRAINT IF EXISTS atomicmarket_auctions_collection_name_fkey;
ALTER TABLE IF EXISTS atomicmarket_sales DROP CONSTRAINT IF EXISTS atomicmarket_sales_collection_name_fkey;

ALTER TABLE IF EXISTS atomicmarket_sales DROP CONSTRAINT IF EXISTS atomicmarket_sales_offer_id_key2;
ALTER TABLE IF EXISTS atomicmarket_sales DROP CONSTRAINT IF EXISTS atomicmarket_sales_offer_id_key;

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

DROP INDEX IF EXISTS atomicmarket_auction_mints_contract;
DROP INDEX IF EXISTS atomicmarket_auctions_created_at_block;
DROP INDEX IF EXISTS atomicmarket_auctions_market_contract;
DROP INDEX IF EXISTS atomicmarket_auctions_updated_at_block;

DROP INDEX IF EXISTS atomicmarket_auctions_assets_assets_contract;
DROP INDEX IF EXISTS atomicmarket_auctions_assets_index;
DROP INDEX IF EXISTS atomicmarket_auctions_assets_market_contract;

DROP INDEX IF EXISTS atomicmarket_auctions_bids_created_at_block;
DROP INDEX IF EXISTS atomicmarket_auctions_bids_market_contract;

DROP INDEX IF EXISTS atomicmarket_balances_market_contract;
DROP INDEX IF EXISTS atomicmarket_balances_updated_at_block;

DROP INDEX IF EXISTS atomicmarket_buyoffer_mints_contract;
DROP INDEX IF EXISTS atomicmarket_buyoffers_assets_contract;
DROP INDEX IF EXISTS atomicmarket_buyoffers_created_at_block;
DROP INDEX IF EXISTS atomicmarket_buyoffers_market_contract;
DROP INDEX IF EXISTS atomicmarket_buyoffers_updated_at_block;

DROP INDEX IF EXISTS atomicmarket_sale_prices_contract;
DROP INDEX IF EXISTS atomicmarket_sales_assets_contract;
DROP INDEX IF EXISTS atomicmarket_sales_created_at_block;
DROP INDEX IF EXISTS atomicmarket_sales_market_contract;
DROP INDEX IF EXISTS atomicmarket_sales_updated_at_block;

DROP INDEX IF EXISTS atomicmarket_template_prices_assets_contract;

DROP INDEX IF EXISTS atomictools_links_created_at_block;

DROP INDEX IF EXISTS atomictools_links_tools_contract;
DROP INDEX IF EXISTS atomictools_links_updated_at_block;

DROP INDEX IF EXISTS atomictools_links_assets_assets_contract;
DROP INDEX IF EXISTS atomictools_links_assets_index;

DROP INDEX IF EXISTS contract_abis_block_time;
DROP INDEX IF EXISTS contract_codes_block_time;

DROP INDEX IF EXISTS contract_traces_created_at_block;

UPDATE dbinfo SET "value" = '1.1.0' WHERE name = 'version';
