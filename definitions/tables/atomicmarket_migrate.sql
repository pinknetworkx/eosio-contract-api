CREATE INDEX IF NOT EXISTS atomicmarket_auctions_assets_asset_id ON atomicmarket_auctions_assets IF EXISTS USING btree (asset_id);
CREATE INDEX IF NOT EXISTS atomicmarket_buyoffers_assets_asset_id ON atomicmarket_buyoffers_assets IF EXISTS USING btree (asset_id);
