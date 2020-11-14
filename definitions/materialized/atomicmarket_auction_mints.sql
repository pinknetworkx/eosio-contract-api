CREATE MATERIALIZED VIEW IF NOT EXISTS atomicmarket_auction_mints AS
    SELECT
        listing.market_contract, listing.auction_id,
        MAX(mint.template_mint) max_template_mint, MIN(mint.template_mint) min_template_mint,
        MAX(mint.schema_mint) max_schema_mint, MIN(mint.schema_mint) min_schema_mint,
        MAX(mint.collection_mint) max_collection_mint, MIN(mint.collection_mint) min_collection_mint
    FROM atomicmarket_auctions listing
        JOIN atomicmarket_auctions_assets asset ON (listing.market_contract = asset.market_contract AND listing.auction_id = asset.auction_id)
        LEFT JOIN atomicassets_asset_mints mint ON (asset.assets_contract = mint.contract AND asset.asset_id = mint.asset_id)
    GROUP BY listing.market_contract, listing.auction_id;

CREATE UNIQUE INDEX atomicmarket_auction_mints_pkey ON atomicmarket_auction_mints (market_contract, auction_id);

CREATE INDEX atomicmarket_auction_mints_contract ON atomicmarket_auction_mints USING btree (market_contract);
CREATE INDEX atomicmarket_auction_mints_auction_id ON atomicmarket_auction_mints USING btree (auction_id);
CREATE INDEX atomicmarket_auction_mints_max_template_mint ON atomicmarket_auction_mints USING btree (max_template_mint);
CREATE INDEX atomicmarket_auction_mints_min_template_mint ON atomicmarket_auction_mints USING btree (min_template_mint);
CREATE INDEX atomicmarket_auction_mints_max_schema_mint ON atomicmarket_auction_mints USING btree (max_schema_mint);
CREATE INDEX atomicmarket_auction_mints_min_schema_mint ON atomicmarket_auction_mints USING btree (min_schema_mint);
CREATE INDEX atomicmarket_auction_mints_max_collection_mint ON atomicmarket_auction_mints USING btree (max_collection_mint);
CREATE INDEX atomicmarket_auction_mints_min_collection_mint ON atomicmarket_auction_mints USING btree (min_collection_mint);
