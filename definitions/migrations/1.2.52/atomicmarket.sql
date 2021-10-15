CREATE INDEX IF NOT EXISTS atomicmarket_sales_taker_market ON atomicmarket_sales USING hash (taker_marketplace COLLATE pg_catalog."default");
CREATE INDEX IF NOT EXISTS atomicmarket_sales_maker_market ON atomicmarket_sales USING hash (maker_marketplace COLLATE pg_catalog."default");
