DROP VIEW IF EXISTS neftymarket_stats_prices_master CASCADE;
DROP VIEW IF EXISTS neftymarket_stats_markets_master CASCADE;

DROP TABLE IF EXISTS neftymarket_stats_markets CASCADE;
CREATE TABLE neftymarket_stats_markets (
    listing_id bigint not null,
    price bigint not null,
    "time" bigint not null,
    template_id bigint,
    asset_id bigint,
    market_contract varchar(12) not null,
    listing_type text not null,
    buyer varchar(12) not null,
    seller varchar(12) not null,
    maker_marketplace varchar(12) not null,
    taker_marketplace varchar(12) not null,
    assets_contract varchar(12) not null,
    collection_name varchar(12),
    schema_name varchar(12),
    symbol varchar(12) not null
);

INSERT INTO neftymarket_stats_markets (market_contract, listing_type, listing_id, buyer, seller, maker_marketplace, taker_marketplace, assets_contract, collection_name, symbol, price, time,
    schema_name, template_id, asset_id)
        SELECT
            auction.market_contract, 'auction' listing_type, auction.auction_id listing_id,
            auction.buyer, auction.seller, auction.maker_marketplace, auction.taker_marketplace,
            auction.assets_contract,
            auction.collection_name,
            auction.token_symbol symbol,
            auction.price,
            auction.end_time "time",
            CASE WHEN COUNT(*) = 1 THEN MIN(asset.schema_name) END AS schema_name,
            CASE WHEN COUNT(*) = 1 THEN MIN(asset.template_id) END AS template_id,
            CASE WHEN COUNT(*) = 1 THEN MIN(asset.asset_id) END AS asset_id
        FROM neftymarket_auctions auction
            JOIN neftymarket_auctions_assets auction_asset ON auction.auction_id = auction_asset.auction_id AND auction.assets_contract = auction_asset.assets_contract
            JOIN atomicassets_assets asset ON auction_asset.asset_id = asset.asset_id AND auction_asset.assets_contract = asset.contract
        WHERE auction.buyer IS NOT NULL AND auction.state = 1 AND auction.end_time < extract(epoch from now()) * 1000
        GROUP BY auction.market_contract, auction.auction_id
;


ALTER TABLE neftymarket_stats_markets
    ADD constraint neftymarket_stats_markets_pkey
        primary key (market_contract, listing_type, listing_id);


CREATE INDEX neftymarket_stats_markets_collection_name ON neftymarket_stats_markets USING btree (collection_name);
CREATE INDEX neftymarket_stats_markets_buyer ON neftymarket_stats_markets USING btree (buyer);
CREATE INDEX neftymarket_stats_markets_seller ON neftymarket_stats_markets USING btree (seller);
CREATE INDEX neftymarket_stats_markets_price ON neftymarket_stats_markets USING btree (price);
CREATE INDEX neftymarket_stats_markets_time ON neftymarket_stats_markets USING btree ("time");
CREATE INDEX neftymarket_stats_markets_asset_id ON neftymarket_stats_markets USING btree ("asset_id");
CREATE INDEX neftymarket_stats_markets_schema_name ON neftymarket_stats_markets USING btree ("schema_name");
CREATE INDEX neftymarket_stats_markets_template_id ON neftymarket_stats_markets USING btree ("template_id");



DROP TABLE IF EXISTS neftymarket_stats_markets_updates;
CREATE TABLE neftymarket_stats_markets_updates(
    market_contract VARCHAR(12),
    listing_type text,
    listing_id BIGINT,
    refresh_at BIGINT NOT NULL DEFAULT 0
);

INSERT INTO neftymarket_stats_markets_updates(market_contract, listing_type, listing_id, refresh_at)
    SELECT
        auction.market_contract, 'auction' listing_type, auction.auction_id listing_id,
        auction.end_time * 1000
    FROM neftymarket_auctions auction
    WHERE auction.buyer IS NOT NULL AND auction.state = 1
;


DROP FUNCTION IF EXISTS update_neftymarket_stats_markets_by_auction CASCADE;
CREATE OR REPLACE FUNCTION update_neftymarket_stats_markets_by_auction() RETURNS TRIGGER AS $$
DECLARE
    affects_stats_markets BOOLEAN;
BEGIN
    affects_stats_markets =
        (TG_OP IN ('INSERT', 'UPDATE') AND NEW.buyer IS NOT NULL AND NEW.state = 1)
        OR
        (TG_OP IN ('DELETE', 'UPDATE') AND OLD.buyer IS NOT NULL AND OLD.state = 1);
    IF (NOT affects_stats_markets)
    THEN RETURN NULL;
    END IF;

    INSERT INTO neftymarket_stats_markets_updates(market_contract, listing_type, listing_id)
    VALUES (
        CASE TG_OP WHEN 'DELETE' THEN OLD.market_contract ELSE NEW.market_contract END,
        'auction',
        CASE TG_OP WHEN 'DELETE' THEN OLD.auction_id ELSE NEW.auction_id END
    );

    IF (TG_OP IN ('INSERT', 'UPDATE'))
    THEN
		INSERT INTO neftymarket_stats_markets_updates(market_contract, listing_type, listing_id, refresh_at)
		VALUES (
			NEW.market_contract,
			'auction',
			NEW.auction_id,
			NEW.end_time * 1000
		);
    END IF;

    RETURN NULL;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS neftymarket_auctions_update_neftymarket_stats_markets_tr ON neftymarket_auctions;
CREATE TRIGGER neftymarket_auctions_update_neftymarket_stats_markets_tr
    AFTER UPDATE OR INSERT OR DELETE ON neftymarket_auctions
    FOR EACH ROW
    EXECUTE FUNCTION update_neftymarket_stats_markets_by_auction();


DROP FUNCTION IF EXISTS update_neftymarket_stats_market;
CREATE OR REPLACE FUNCTION update_neftymarket_stats_market() RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
    result INT;
    current_block_time BIGINT = (SELECT MAX(block_time) FROM contract_readers);
BEGIN
    WITH changed_listings AS (
        DELETE FROM neftymarket_stats_markets_updates u
        WHERE refresh_at <= current_block_time
        RETURNING market_contract, listing_type, listing_id
    ), updated_listings AS (
        SELECT
            auction.market_contract, 'auction' listing_type, auction.auction_id listing_id,
            auction.buyer, auction.seller, auction.maker_marketplace, auction.taker_marketplace,
            auction.assets_contract, auction.collection_name,
            auction.token_symbol symbol, auction.price, (auction.end_time * 1000) "time",
            CASE WHEN COUNT(*) = 1 THEN MIN(asset.schema_name) END AS schema_name,
            CASE WHEN COUNT(*) = 1 THEN MIN(asset.template_id) END AS template_id,
            CASE WHEN COUNT(*) = 1 THEN MIN(asset.asset_id) END AS asset_id
        FROM neftymarket_auctions auction
            JOIN neftymarket_auctions_assets auction_asset ON auction.auction_id = auction_asset.auction_id AND auction.assets_contract = auction_asset.assets_contract
            JOIN atomicassets_assets asset ON auction_asset.asset_id = asset.asset_id AND auction_asset.assets_contract = asset.contract
        WHERE auction.buyer IS NOT NULL AND auction.state = 1 AND auction.end_time < extract(epoch from now())
            AND (auction.market_contract, auction.auction_id) IN (
                SELECT market_contract, listing_id
                FROM changed_listings
                WHERE listing_type = 'auction'
            )
        GROUP BY auction.market_contract, auction.auction_id
    ), ins_upd AS (
        INSERT INTO neftymarket_stats_markets AS m (
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
        DELETE FROM neftymarket_stats_markets
        WHERE (market_contract, listing_type, listing_id) IN (
            SELECT market_contract, listing_type, listing_id FROM changed_listings
            EXCEPT
            SELECT market_contract, listing_type, listing_id FROM ins_upd
        )
        RETURNING 1
    )
    SELECT COALESCE((SELECT COUNT(*) FROM ins_upd), 0)
        + COALESCE((SELECT COUNT(*) FROM del), 0)
    INTO result;

    RETURN result;
END
$$;


CREATE OR REPLACE VIEW neftymarket_template_prices_master AS
    SELECT
        t2.market_contract, t2.assets_contract::text, t2.collection_name, t2.template_id, t2.symbol,
        PERCENTILE_DISC(0.5) WITHIN GROUP (ORDER BY t2.price) median,
        AVG(t2.price)::bigint average,
        PERCENTILE_DISC(0.5) WITHIN GROUP (ORDER BY t2.price) FILTER (WHERE t2.number <= 5 OR t2."time" / 1000 >= extract(epoch from now()) - 3600 * 24 * 3) suggested_median,
        (AVG(t2.price) FILTER (WHERE t2.number <= 5 OR t2."time" / 1000 >= extract(epoch from now()) - 3600 * 24 * 3))::bigint suggested_average,
        MIN(t2.price) "min", MAX(t2.price) "max", COUNT(*) sales
    FROM (
        SELECT
            t1.*, row_number() OVER (PARTITION BY t1.assets_contract, t1.collection_name, t1.template_id ORDER BY t1."time" DESC) "number"
        FROM neftymarket_stats_markets t1
        WHERE t1.template_id IS NOT NULL
    ) t2
    GROUP BY t2.market_contract, t2.assets_contract, t2.collection_name, t2.template_id, t2.symbol
;


CREATE MATERIALIZED VIEW IF NOT EXISTS neftymarket_template_prices AS
    SELECT * FROM neftymarket_template_prices_master;

CREATE UNIQUE INDEX neftymarket_template_prices_pkey ON neftymarket_template_prices (market_contract, assets_contract, collection_name, template_id, symbol);
CREATE INDEX neftymarket_template_prices_fkey ON neftymarket_template_prices (assets_contract, collection_name, template_id);

CREATE INDEX neftymarket_template_prices_collection_name ON neftymarket_template_prices USING btree (collection_name);
CREATE INDEX neftymarket_template_prices_template_id ON neftymarket_template_prices USING btree (template_id);
CREATE INDEX neftymarket_template_prices_median ON neftymarket_template_prices USING btree (median);
CREATE INDEX neftymarket_template_prices_average ON neftymarket_template_prices USING btree (average);
CREATE INDEX neftymarket_template_prices_suggested_median ON neftymarket_template_prices USING btree (suggested_median);
CREATE INDEX neftymarket_template_prices_suggested_average ON neftymarket_template_prices USING btree (suggested_average);
CREATE INDEX neftymarket_template_prices_min ON neftymarket_template_prices USING btree ("min");
CREATE INDEX neftymarket_template_prices_max ON neftymarket_template_prices USING btree ("max");
CREATE INDEX neftymarket_template_prices_sales ON neftymarket_template_prices USING btree (sales);
