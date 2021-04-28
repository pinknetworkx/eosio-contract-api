DROP INDEX IF EXISTS atomicmarket_sales_maker_marketplace;
DROP INDEX IF EXISTS atomicmarket_sales_taker_marketplace;
DROP INDEX IF EXISTS atomicmarket_auctions_maker_marketplace;
DROP INDEX IF EXISTS atomicmarket_auctions_taker_marketplace;
DROP INDEX IF EXISTS atomicmarket_buyoffers_maker_marketplace;
DROP INDEX IF EXISTS atomicmarket_buyoffers_taker_marketplace;
DROP INDEX IF EXISTS atomicmarket_buyoffers_token_symbol;

CREATE INDEX IF NOT EXISTS atomicmarket_auctions_bids_created_at_time ON atomicmarket_auctions_bids USING btree (created_at_time);
