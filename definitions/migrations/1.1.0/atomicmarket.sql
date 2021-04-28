DROP MATERIALIZED VIEW IF EXISTS atomicmarket_buyoffer_stats;
DROP MATERIALIZED VIEW IF EXISTS atomicmarket_auction_stats;
DROP MATERIALIZED VIEW IF EXISTS atomicmarket_sale_stats;

ALTER TABLE IF EXISTS atomicmarket_auctions_assets DROP CONSTRAINT IF EXISTS atomicmarket_auctions_assets_assets_fkey;
ALTER TABLE IF EXISTS atomicmarket_sales DROP CONSTRAINT IF EXISTS atomicmarket_sales_offer_id_fkey;
ALTER TABLE IF EXISTS atomicmarket_buyoffers DROP CONSTRAINT IF EXISTS atomicmarket_buyoffers_collection_name_fkey;
ALTER TABLE IF EXISTS atomicmarket_auctions DROP CONSTRAINT IF EXISTS atomicmarket_auctions_collection_name_fkey;
ALTER TABLE IF EXISTS atomicmarket_sales DROP CONSTRAINT IF EXISTS atomicmarket_sales_collection_name_fkey;

ALTER TABLE IF EXISTS atomicmarket_sales DROP CONSTRAINT IF EXISTS atomicmarket_sales_offer_id_key2;
ALTER TABLE IF EXISTS atomicmarket_sales DROP CONSTRAINT IF EXISTS atomicmarket_sales_offer_id_key;

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

CREATE INDEX IF NOT EXISTS atomicmarket_sales_offer_id ON atomicmarket_sales USING btree (offer_id);
CREATE INDEX IF NOT EXISTS atomicmarket_auctions_assets_asset_id ON atomicmarket_auctions_assets USING btree (asset_id);
CREATE INDEX IF NOT EXISTS atomicmarket_buyoffers_assets_asset_id ON atomicmarket_buyoffers_assets USING btree (asset_id);

