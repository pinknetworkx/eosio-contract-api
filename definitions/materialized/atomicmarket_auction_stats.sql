CREATE MATERIALIZED VIEW IF NOT EXISTS atomicmarket_auction_stats AS
    SELECT
        auction.market_contract, auction.auction_id,
        SUM(price.suggested_average) suggested_average, SUM(price.suggested_median) suggested_median,
        SUM(price.average) average, SUM(price.median) median,
        MIN(price.sales) sales
    FROM atomicmarket_auctions auction, atomicmarket_auctions_assets auction_asset, atomicassets_assets asset, atomicmarket_template_prices price
    WHERE auction.market_contract = auction_asset.market_contract AND auction.auction_id = auction_asset.auction_id AND
        auction_asset.assets_contract = asset.contract AND auction_asset.asset_id = asset.asset_id AND
        price.market_contract = auction.market_contract AND price.assets_contract = asset.contract AND
        price.collection_name = asset.collection_name AND price.template_id = asset.template_id AND price.symbol = auction.token_symbol
    GROUP BY auction.market_contract, auction.auction_id;

CREATE UNIQUE INDEX atomicmarket_auction_stats_pkey ON atomicmarket_auction_stats (market_contract, auction_id);

CREATE INDEX atomicmarket_auction_stats_contract ON atomicmarket_auction_stats USING btree (market_contract);
CREATE INDEX atomicmarket_auction_stats_auction_id ON atomicmarket_auction_stats USING btree (auction_id);
CREATE INDEX atomicmarket_auction_stats_suggested_average ON atomicmarket_auction_stats USING btree (suggested_average);
CREATE INDEX atomicmarket_auction_stats_suggested_median ON atomicmarket_auction_stats USING btree (suggested_median);
CREATE INDEX atomicmarket_auction_stats_average ON atomicmarket_auction_stats USING btree (average);
CREATE INDEX atomicmarket_auction_stats_median ON atomicmarket_auction_stats USING btree (median);
