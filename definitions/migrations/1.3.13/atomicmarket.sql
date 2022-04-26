-- TODO activate DROP MATERIALIZED VIEW IF EXISTS atomicmarket_stats_markets;

DROP VIEW IF EXISTS atomicmarket_stats_markets_master;

DROP TABLE IF EXISTS atomicmarket_stats_markets;
CREATE TABLE atomicmarket_stats_markets (
	market_contract varchar(12) not null,
    listing_type text not null,
    listing_id bigint not null,
    buyer varchar(12) not null,
    seller varchar(12) not null,
    maker_marketplace varchar(12) not null,
    taker_marketplace varchar(12) not null,
    assets_contract varchar(12) not null,
    collection_name varchar(12),
    symbol varchar(12) not null,
    price bigint not null,
    "time" bigint not null
);


INSERT INTO atomicmarket_stats_markets (market_contract, listing_type, listing_id, buyer, seller, maker_marketplace, taker_marketplace, assets_contract, collection_name, symbol, price, time)
        SELECT
            sale.market_contract, 'sale' listing_type, sale.sale_id listing_id,
            sale.buyer, sale.seller, sale.maker_marketplace, sale.taker_marketplace,
            sale.assets_contract, sale.collection_name,
            sale.settlement_symbol symbol, sale.final_price price, sale.updated_at_time "time"
        FROM atomicmarket_sales sale
        WHERE sale.final_price IS NOT NULL AND sale.state = 3
;
INSERT INTO atomicmarket_stats_markets (market_contract, listing_type, listing_id, buyer, seller, maker_marketplace, taker_marketplace, assets_contract, collection_name, symbol, price, time)
        SELECT
            auction.market_contract, 'auction' listing_type, auction.auction_id listing_id,
            auction.buyer, auction.seller, auction.maker_marketplace, auction.taker_marketplace,
            auction.assets_contract, auction.collection_name,
            auction.token_symbol symbol, auction.price, (auction.end_time * 1000) "time"
        FROM atomicmarket_auctions auction
        WHERE auction.buyer IS NOT NULL AND auction.state = 1 AND auction.end_time < extract(epoch from now())
;
INSERT INTO atomicmarket_stats_markets (market_contract, listing_type, listing_id, buyer, seller, maker_marketplace, taker_marketplace, assets_contract, collection_name, symbol, price, time)
        SELECT
            buyoffer.market_contract, 'buyoffer' listing_type, buyoffer.buyoffer_id listing_id,
            buyoffer.buyer, buyoffer.seller, buyoffer.maker_marketplace, buyoffer.taker_marketplace,
            buyoffer.assets_contract, buyoffer.collection_name,
            buyoffer.token_symbol symbol, buyoffer.price, buyoffer.updated_at_time "time"
        FROM atomicmarket_buyoffers buyoffer
        WHERE buyoffer.state = 3
;


ALTER TABLE atomicmarket_stats_markets
	ADD constraint atomicmarket_stats_markets_pkey
		primary key (market_contract, listing_type, listing_id);


CREATE INDEX atomicmarket_stats_markets_collection_name ON atomicmarket_stats_markets USING btree (collection_name);
CREATE INDEX atomicmarket_stats_markets_buyer ON atomicmarket_stats_markets USING btree (buyer);
CREATE INDEX atomicmarket_stats_markets_seller ON atomicmarket_stats_markets USING btree (seller);
CREATE INDEX atomicmarket_stats_markets_price ON atomicmarket_stats_markets USING btree (price);
CREATE INDEX atomicmarket_stats_markets_time ON atomicmarket_stats_markets USING btree ("time");



DROP TABLE IF EXISTS atomicmarket_stats_markets_updates;
CREATE TABLE atomicmarket_stats_markets_updates(
    market_contract VARCHAR(12),
    listing_type text,
    listing_id BIGINT
);


DROP FUNCTION IF EXISTS update_atomicmarket_stats_markets_by_sale CASCADE;
CREATE OR REPLACE FUNCTION update_atomicmarket_stats_markets_by_sale() RETURNS TRIGGER AS $$
DECLARE
    affects_stats_markets BOOLEAN;
BEGIN
    affects_stats_markets =
        (TG_OP IN ('INSERT', 'UPDATE') AND NEW.final_price IS NOT NULL AND NEW.state = 3)
        OR
        (TG_OP IN ('DELETE', 'UPDATE') AND OLD.final_price IS NOT NULL AND OLD.state = 3);
    IF (NOT affects_stats_markets)
    THEN RETURN NULL;
    END IF;

    INSERT INTO atomicmarket_stats_markets_updates(market_contract, listing_type, listing_id)
    VALUES (
        CASE TG_OP WHEN 'DELETE' THEN OLD.market_contract ELSE NEW.market_contract END,
        'sale',
        CASE TG_OP WHEN 'DELETE' THEN OLD.sale_id ELSE NEW.sale_id END
    );

    RETURN NULL;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS atomicmarket_sales_update_atomicmarket_stats_markets_tr ON atomicmarket_sales;
CREATE TRIGGER atomicmarket_sales_update_atomicmarket_stats_markets_tr
    AFTER UPDATE OR INSERT OR DELETE ON atomicmarket_sales
    FOR EACH ROW
    EXECUTE FUNCTION update_atomicmarket_stats_markets_by_sale();


DROP FUNCTION IF EXISTS update_atomicmarket_stats_markets_by_auction CASCADE;
CREATE OR REPLACE FUNCTION update_atomicmarket_stats_markets_by_auction() RETURNS TRIGGER AS $$
DECLARE
    affects_stats_markets BOOLEAN;
BEGIN
    affects_stats_markets =
        (TG_OP IN ('INSERT', 'UPDATE') AND NEW.buyer IS NOT NULL AND NEW.state = 1 AND NEW.end_time < extract(epoch from now()))
        OR
        (TG_OP IN ('DELETE', 'UPDATE') AND OLD.buyer IS NOT NULL AND OLD.state = 1 AND OLD.end_time < extract(epoch from now()));
    IF (NOT affects_stats_markets)
    THEN RETURN NULL;
    END IF;

    INSERT INTO atomicmarket_stats_markets_updates(market_contract, listing_type, listing_id)
    VALUES (
        CASE TG_OP WHEN 'DELETE' THEN OLD.market_contract ELSE NEW.market_contract END,
        'auction',
        CASE TG_OP WHEN 'DELETE' THEN OLD.auction_id ELSE NEW.auction_id END
    );

    RETURN NULL;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS atomicmarket_auctions_update_atomicmarket_stats_markets_tr ON atomicmarket_auctions;
CREATE TRIGGER atomicmarket_auctions_update_atomicmarket_stats_markets_tr
    AFTER UPDATE OR INSERT OR DELETE ON atomicmarket_auctions
    FOR EACH ROW
    EXECUTE FUNCTION update_atomicmarket_stats_markets_by_auction();


DROP FUNCTION IF EXISTS update_atomicmarket_stats_markets_by_buyoffer CASCADE;
CREATE OR REPLACE FUNCTION update_atomicmarket_stats_markets_by_buyoffer() RETURNS TRIGGER AS $$
DECLARE
    affects_stats_markets BOOLEAN;
BEGIN
    affects_stats_markets =
        (TG_OP IN ('INSERT', 'UPDATE') AND NEW.state = 3)
        OR
        (TG_OP IN ('DELETE', 'UPDATE') AND OLD.state = 3);
    IF (NOT affects_stats_markets)
    THEN RETURN NULL;
    END IF;

    INSERT INTO atomicmarket_stats_markets_updates(market_contract, listing_type, listing_id)
    VALUES (
        CASE TG_OP WHEN 'DELETE' THEN OLD.market_contract ELSE NEW.market_contract END,
        'buyoffer',
        CASE TG_OP WHEN 'DELETE' THEN OLD.buyoffer_id ELSE NEW.buyoffer_id END
    );

    RETURN NULL;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS atomicmarket_buyoffers_update_atomicmarket_stats_markets_tr ON atomicmarket_buyoffers;
CREATE TRIGGER atomicmarket_buyoffers_update_atomicmarket_stats_markets_tr
    AFTER UPDATE OR INSERT OR DELETE ON atomicmarket_buyoffers
    FOR EACH ROW
    EXECUTE FUNCTION update_atomicmarket_stats_markets_by_buyoffer();

DROP FUNCTION IF EXISTS update_atomicmarket_stats;
CREATE OR REPLACE FUNCTION update_atomicmarket_stats() RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
    result INT;
BEGIN
    WITH changed_listings AS (
        DELETE FROM atomicmarket_stats_markets_updates u
        RETURNING market_contract, listing_type, listing_id
    ), updated_listings AS (
        SELECT
            sale.market_contract, 'sale' listing_type, sale.sale_id listing_id,
            sale.buyer, sale.seller, sale.maker_marketplace, sale.taker_marketplace,
            sale.assets_contract, sale.collection_name,
            sale.settlement_symbol symbol, sale.final_price price, sale.updated_at_time "time"
        FROM atomicmarket_sales sale
        WHERE sale.final_price IS NOT NULL AND sale.state = 3
            AND (market_contract, sale_id) IN (
                SELECT market_contract, listing_id
                FROM changed_listings
                WHERE listing_type = 'sale'
            )

        UNION ALL

        SELECT
            auction.market_contract, 'auction' listing_type, auction.auction_id listing_id,
            auction.buyer, auction.seller, auction.maker_marketplace, auction.taker_marketplace,
            auction.assets_contract, auction.collection_name,
            auction.token_symbol symbol, auction.price, (auction.end_time * 1000) "time"
        FROM atomicmarket_auctions auction
        WHERE auction.buyer IS NOT NULL AND auction.state = 1 AND auction.end_time < extract(epoch from now())
            AND (market_contract, auction_id) IN (
                SELECT market_contract, listing_id
                FROM changed_listings
                WHERE listing_type = 'auction'
            )

        UNION ALL

        SELECT
            buyoffer.market_contract, 'buyoffer' listing_type, buyoffer.buyoffer_id listing_id,
            buyoffer.buyer, buyoffer.seller, buyoffer.maker_marketplace, buyoffer.taker_marketplace,
            buyoffer.assets_contract, buyoffer.collection_name,
            buyoffer.token_symbol symbol, buyoffer.price, buyoffer.updated_at_time "time"
        FROM atomicmarket_buyoffers buyoffer
        WHERE buyoffer.state = 3
            AND (market_contract, buyoffer_id) IN (
                SELECT market_contract, listing_id
                FROM changed_listings
                WHERE listing_type = 'buyoffer'
            )
    ), ins_upd AS (
        INSERT INTO atomicmarket_stats_markets AS m (
            market_contract, listing_type, listing_id, buyer, seller,
            maker_marketplace, taker_marketplace, assets_contract,
            collection_name, symbol, price, "time"
        )
            SELECT DISTINCT
                market_contract, listing_type, listing_id, buyer, seller,
                maker_marketplace, taker_marketplace, assets_contract,
                collection_name, symbol, price, "time"
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
                "time" = EXCLUDED."time"
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
        RETURNING market_contract, listing_type, listing_id
    ), del AS (
        DELETE FROM atomicmarket_stats_markets
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
