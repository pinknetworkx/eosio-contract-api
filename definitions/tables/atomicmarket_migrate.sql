CREATE INDEX IF NOT EXISTS atomicmarket_sales_offer_id ON atomicmarket_sales USING btree (offer_id);

CREATE INDEX IF NOT EXISTS atomicmarket_auctions_assets_asset_id ON atomicmarket_auctions_assets USING btree (asset_id);
CREATE INDEX IF NOT EXISTS atomicmarket_buyoffers_assets_asset_id ON atomicmarket_buyoffers_assets USING btree (asset_id);
