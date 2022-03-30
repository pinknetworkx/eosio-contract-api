CREATE INDEX IF NOT EXISTS atomicmarket_sales_maker_marketplace ON atomicmarket_sales USING btree(maker_marketplace);
CREATE INDEX IF NOT EXISTS atomicmarket_sales_taker_marketplace ON atomicmarket_sales USING btree(taker_marketplace);
