/*
-- Run before upgrade to make the migration faster:
CREATE INDEX CONCURRENTLY IF NOT EXISTS atomicassets_transfers_accounts ON atomicassets_transfers USING gin((sender || e'\n' || recipient) gin_trgm_ops);

*/

CREATE INDEX IF NOT EXISTS atomicassets_transfers_accounts ON atomicassets_transfers USING gin((sender || e'\n' || recipient) gin_trgm_ops);



TRUNCATE atomicassets_template_counts;

ALTER TABLE atomicassets_template_counts RENAME TO atomicassets_asset_counts;

DROP INDEX atomicassets_template_counts_contract_template_id;
DROP INDEX atomicassets_template_counts_dirty;

ALTER TABLE atomicassets_asset_counts ADD COLUMN collection_name VARCHAR(12) NOT NULL;
ALTER TABLE atomicassets_asset_counts ADD COLUMN schema_name VARCHAR(12) NOT NULL;

ALTER TABLE atomicassets_asset_counts ALTER COLUMN template_id SET NOT NULL;

INSERT INTO atomicassets_asset_counts(contract, collection_name, schema_name, template_id, assets, burned, owned, dirty)
    SELECT
        contract, collection_name, schema_name, COALESCE(template_id, 0),
        COUNT(*) assets,
        COUNT(*) FILTER (WHERE owner IS NULL) burned,
        COUNT(*) FILTER (WHERE owner IS NOT NULL) AS owned,
        NULL
    FROM atomicassets_assets
    GROUP BY contract, collection_name, schema_name, template_id
;


CREATE INDEX atomicassets_asset_counts_collection_schema_template
	ON atomicassets_asset_counts (contract, collection_name, schema_name, template_id);

CREATE INDEX atomicassets_asset_counts_contract_template_id
	ON atomicassets_asset_counts (contract, template_id);

CREATE INDEX atomicassets_template_counts_dirty
	ON atomicassets_asset_counts (contract, collection_name, schema_name, template_id)
	WHERE dirty;



DROP FUNCTION update_atomicassets_template_counts CASCADE;

CREATE OR REPLACE FUNCTION update_atomicassets_asset_counts() RETURNS TRIGGER AS $$
DECLARE
    update_and_changed BOOLEAN = (TG_OP = 'UPDATE')
        AND (
            OLD.contract IS DISTINCT FROM NEW.contract
            OR OLD.collection_name IS DISTINCT FROM NEW.collection_name
            OR OLD.schema_name IS DISTINCT FROM NEW.schema_name
            OR OLD.template_id IS DISTINCT FROM NEW.template_id
            OR OLD.owner IS DISTINCT FROM NEW.owner
        );
BEGIN
    IF (update_and_changed OR (TG_OP = 'DELETE')) THEN
        INSERT INTO atomicassets_asset_counts (contract, collection_name, schema_name, template_id, assets, burned, owned)
        VALUES (OLD.contract, OLD.collection_name, OLD.schema_name, COALESCE(OLD.template_id, 0), -1, CASE WHEN OLD.owner IS NULL THEN -1 END, CASE WHEN OLD.owner IS NOT NULL THEN -1 END);
    END IF;

    IF (update_and_changed OR (TG_OP = 'INSERT')) THEN
        INSERT INTO atomicassets_asset_counts (contract, collection_name, schema_name, template_id, assets, burned, owned)
        VALUES (NEW.contract, NEW.collection_name, NEW.schema_name, COALESCE(NEW.template_id, 0), 1, CASE WHEN NEW.owner IS NULL THEN 1 END, CASE WHEN NEW.owner IS NOT NULL THEN 1 END);
    END IF;

    RETURN NULL;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_atomicassets_asset_counts_tr ON atomicassets_assets;
CREATE TRIGGER update_atomicassets_asset_counts_tr
    AFTER UPDATE OR INSERT OR DELETE ON atomicassets_assets
    FOR EACH ROW
    EXECUTE FUNCTION update_atomicassets_asset_counts();

-- fix atomicmarket_stats_markets
CREATE OR REPLACE FUNCTION update_atomicmarket_stats_market() RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
    result INT;
    current_block_time BIGINT = (SELECT MAX(block_time) FROM contract_readers);
BEGIN
    WITH changed_listings AS (
        DELETE FROM atomicmarket_stats_markets_updates u
        WHERE refresh_at <= current_block_time
        RETURNING market_contract, listing_type, listing_id
    ), updated_listings AS (
        SELECT
            sale.market_contract, 'sale' listing_type, sale.sale_id listing_id,
            sale.buyer, sale.seller, sale.maker_marketplace, sale.taker_marketplace,
            sale.assets_contract, sale.collection_name,
            sale.settlement_symbol symbol, sale.final_price price, sale.updated_at_time "time",
            CASE WHEN COUNT(*) = 1 THEN MIN(asset.schema_name) END AS schema_name,
            CASE WHEN COUNT(*) = 1 THEN MIN(asset.template_id) END AS template_id,
            CASE WHEN COUNT(*) = 1 THEN MIN(asset.asset_id) END AS asset_id
        FROM atomicmarket_sales sale
            JOIN atomicassets_offers_assets offer_asset ON sale.offer_id = offer_asset.offer_id AND sale.assets_contract = offer_asset.contract
            JOIN atomicassets_assets asset ON offer_asset.asset_id = asset.asset_id AND offer_asset.contract = asset.contract
        WHERE sale.final_price IS NOT NULL AND sale.state = 3
            AND (sale.market_contract, sale.sale_id) IN (
                SELECT market_contract, listing_id
                FROM changed_listings
                WHERE listing_type = 'sale'
            )
        GROUP BY sale.market_contract, sale.sale_id

        UNION ALL

        SELECT
            auction.market_contract, 'auction' listing_type, auction.auction_id listing_id,
            auction.buyer, auction.seller, auction.maker_marketplace, auction.taker_marketplace,
            auction.assets_contract, auction.collection_name,
            auction.token_symbol symbol, auction.price, (auction.end_time * 1000) "time",
            CASE WHEN COUNT(*) = 1 THEN MIN(asset.schema_name) END AS schema_name,
            CASE WHEN COUNT(*) = 1 THEN MIN(asset.template_id) END AS template_id,
            CASE WHEN COUNT(*) = 1 THEN MIN(asset.asset_id) END AS asset_id
        FROM atomicmarket_auctions auction
            JOIN atomicmarket_auctions_assets auction_asset ON auction.auction_id = auction_asset.auction_id AND auction.assets_contract = auction_asset.assets_contract
            JOIN atomicassets_assets asset ON auction_asset.asset_id = asset.asset_id AND auction_asset.assets_contract = asset.contract
        WHERE auction.buyer IS NOT NULL AND auction.state = 1 AND auction.end_time < extract(epoch from now())
            AND (auction.market_contract, auction.auction_id) IN (
                SELECT market_contract, listing_id
                FROM changed_listings
                WHERE listing_type = 'auction'
            )
        GROUP BY auction.market_contract, auction.auction_id

        UNION ALL

        SELECT
            buyoffer.market_contract, 'buyoffer' listing_type, buyoffer.buyoffer_id listing_id,
            buyoffer.buyer, buyoffer.seller, buyoffer.maker_marketplace, buyoffer.taker_marketplace,
            buyoffer.assets_contract, buyoffer.collection_name,
            buyoffer.token_symbol symbol, buyoffer.price, buyoffer.updated_at_time "time",
            CASE WHEN COUNT(*) = 1 THEN MIN(asset.schema_name) END AS schema_name,
            CASE WHEN COUNT(*) = 1 THEN MIN(asset.template_id) END AS template_id,
            CASE WHEN COUNT(*) = 1 THEN MIN(asset.asset_id) END AS asset_id
        FROM atomicmarket_buyoffers buyoffer
            JOIN atomicmarket_buyoffers_assets buyoffer_asset ON buyoffer.buyoffer_id = buyoffer_asset.buyoffer_id AND buyoffer.assets_contract = buyoffer_asset.assets_contract
            JOIN atomicassets_assets asset ON buyoffer_asset.asset_id = asset.asset_id AND buyoffer_asset.assets_contract = asset.contract
        WHERE buyoffer.state = 3
            AND (buyoffer.market_contract, buyoffer.buyoffer_id) IN (
                SELECT market_contract, listing_id
                FROM changed_listings
                WHERE listing_type = 'buyoffer'
            )
        GROUP BY buyoffer.market_contract, buyoffer.buyoffer_id
    ), ins_upd AS (
        INSERT INTO atomicmarket_stats_markets AS m (
            market_contract, listing_type, listing_id, buyer, seller,
            maker_marketplace, taker_marketplace, assets_contract,
            collection_name, symbol, price, "time",
            schema_name, template_id, asset_id
        )
            SELECT
                market_contract, listing_type, listing_id, buyer, seller,
                maker_marketplace, taker_marketplace, assets_contract,
                collection_name, symbol, price, "time",
                schema_name, template_id, asset_id
            FROM updated_listings
        ON CONFLICT (market_contract, listing_type, listing_id)
            DO UPDATE SET
                buyer = EXCLUDED.buyer,
                seller = EXCLUDED.seller,
                maker_marketplace = EXCLUDED.maker_marketplace,
                taker_marketplace = EXCLUDED.taker_marketplace,
                assets_contract = EXCLUDED.assets_contract,
                collection_name = EXCLUDED.collection_name,
                symbol = EXCLUDED.symbol,
                price = EXCLUDED.price,
                "time" = EXCLUDED."time",
                schema_name = EXCLUDED.schema_name,
                template_id = EXCLUDED.template_id,
                asset_id = EXCLUDED.asset_id
            WHERE
                m.buyer IS DISTINCT FROM EXCLUDED.buyer
                OR m.seller IS DISTINCT FROM EXCLUDED.seller
                OR m.price IS DISTINCT FROM EXCLUDED.price
                OR m.maker_marketplace IS DISTINCT FROM EXCLUDED.maker_marketplace
                OR m.taker_marketplace IS DISTINCT FROM EXCLUDED.taker_marketplace
                OR m.assets_contract IS DISTINCT FROM EXCLUDED.assets_contract
                OR m.collection_name IS DISTINCT FROM EXCLUDED.collection_name
                OR m.symbol IS DISTINCT FROM EXCLUDED.symbol
                OR m.price IS DISTINCT FROM EXCLUDED.price
                OR m."time" IS DISTINCT FROM EXCLUDED."time"
                OR m.schema_name IS DISTINCT FROM EXCLUDED.schema_name
                OR m.template_id IS DISTINCT FROM EXCLUDED.template_id
                OR m.asset_id IS DISTINCT FROM EXCLUDED.asset_id
        RETURNING market_contract, listing_type, listing_id
    ), del AS (
        DELETE FROM atomicmarket_stats_markets
        WHERE (market_contract, listing_type, listing_id) IN (
            SELECT market_contract, listing_type, listing_id FROM changed_listings
            EXCEPT
            SELECT market_contract, listing_type, listing_id FROM updated_listings
        )
        RETURNING 1
    )
    SELECT COALESCE((SELECT COUNT(*) FROM ins_upd), 0)
        + COALESCE((SELECT COUNT(*) FROM del), 0)
    INTO result;

    RETURN result;
END
$$;


INSERT INTO atomicmarket_stats_markets_updates (market_contract, listing_type, listing_id)
        SELECT sale.market_contract, 'sale' listing_type, sale.sale_id listing_id
        FROM atomicmarket_sales sale
        WHERE sale.final_price IS NOT NULL AND sale.state = 3
        EXCEPT
        SELECT market_contract, listing_type, listing_id
        FROM atomicmarket_stats_markets
        WHERE listing_type = 'sale'
;
INSERT INTO atomicmarket_stats_markets_updates (market_contract, listing_type, listing_id)
        SELECT auction.market_contract, 'auction' listing_type, auction.auction_id listing_id
        FROM atomicmarket_auctions auction
        WHERE auction.buyer IS NOT NULL AND auction.state = 1 AND auction.end_time < extract(epoch from now())
        EXCEPT
        SELECT market_contract, listing_type, listing_id
        FROM atomicmarket_stats_markets
        WHERE listing_type = 'auction'
;
INSERT INTO atomicmarket_stats_markets_updates (market_contract, listing_type, listing_id)
        SELECT buyoffer.market_contract, 'buyoffer' listing_type, buyoffer.buyoffer_id listing_id
        FROM atomicmarket_buyoffers buyoffer
        WHERE buyoffer.state = 3
        EXCEPT
        SELECT market_contract, listing_type, listing_id
        FROM atomicmarket_stats_markets
        WHERE listing_type = 'buyoffer'
;

SELECT update_atomicmarket_stats_market();
