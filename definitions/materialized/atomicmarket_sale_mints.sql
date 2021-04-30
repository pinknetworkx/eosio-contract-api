CREATE MATERIALIZED VIEW IF NOT EXISTS atomicmarket_sale_mints AS
    SELECT
        listing.market_contract, listing.sale_id,
        MAX(mint.template_mint) max_template_mint, MIN(mint.template_mint) min_template_mint,
        MAX(mint.schema_mint) max_schema_mint, MIN(mint.schema_mint) min_schema_mint,
        MAX(mint.collection_mint) max_collection_mint, MIN(mint.collection_mint) min_collection_mint
    FROM atomicmarket_sales listing
        JOIN atomicassets_offers_assets asset ON (listing.assets_contract = asset.contract AND listing.offer_id = asset.offer_id)
        LEFT JOIN atomicassets_asset_mints mint ON (asset.contract = mint.contract AND asset.asset_id = mint.asset_id)
    GROUP BY listing.market_contract, listing.sale_id;

CREATE UNIQUE INDEX atomicmarket_sale_mints_pkey ON atomicmarket_sale_mints (market_contract, sale_id);

CREATE INDEX atomicmarket_sale_mints_sale_id ON atomicmarket_sale_mints USING btree (sale_id);
CREATE INDEX atomicmarket_sale_mints_max_template_mint ON atomicmarket_sale_mints USING btree (max_template_mint);
CREATE INDEX atomicmarket_sale_mints_min_template_mint ON atomicmarket_sale_mints USING btree (min_template_mint);
