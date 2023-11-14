DROP TABLE IF EXISTS atomicmarket_template_buyoffers CASCADE;
CREATE TABLE atomicmarket_template_buyoffers
(
    market_contract character varying(12) NOT NULL,
    buyoffer_id bigint NOT NULL,
    buyer character varying(12) NOT NULL,
    seller character varying(12),
    price bigint NOT NULL,
    token_symbol character varying(12) NOT NULL,
    assets_contract character varying(12) NOT NULL,
    maker_marketplace character varying(12) NOT NULL,
    taker_marketplace character varying(12),
    template_mint int4range,
    collection_name character varying(12) NOT NULL,
    collection_fee double precision NOT NULL,
    template_id bigint NOT NULL,
    state smallint NOT NULL,
    updated_at_block bigint NOT NULL,
    updated_at_time bigint NOT NULL,
    created_at_block bigint NOT NULL,
    created_at_time bigint NOT NULL,
    CONSTRAINT atomicmarket_template_buyoffers_pkey PRIMARY KEY (market_contract, buyoffer_id)
);

DROP TABLE IF EXISTS atomicmarket_template_buyoffers_assets CASCADE;
CREATE TABLE atomicmarket_template_buyoffers_assets
(
    market_contract character varying(12) NOT NULL,
    buyoffer_id bigint NOT NULL,
    assets_contract character varying(12) NOT NULL,
    "index" integer NOT NULL,
    asset_id bigint NOT NULL,
    CONSTRAINT atomicmarket_template_buyoffers_assets_pkey PRIMARY KEY (market_contract, buyoffer_id, assets_contract, asset_id)
);

ALTER TABLE ONLY atomicmarket_template_buyoffers
    ADD CONSTRAINT atomicmarket_template_buyoffers_token_symbol_fkey FOREIGN KEY (market_contract, token_symbol)
    REFERENCES atomicmarket_tokens (market_contract, token_symbol) MATCH SIMPLE ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE ONLY atomicmarket_template_buyoffers
    ADD CONSTRAINT atomicmarket_template_buyoffers_maker_marketplace_fkey FOREIGN KEY (market_contract, maker_marketplace)
    REFERENCES atomicmarket_marketplaces (market_contract, marketplace_name) MATCH SIMPLE ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE ONLY atomicmarket_template_buyoffers
    ADD CONSTRAINT atomicmarket_template_buyoffers_taker_marketplace_fkey FOREIGN KEY (market_contract, taker_marketplace)
    REFERENCES atomicmarket_marketplaces (market_contract, marketplace_name) MATCH SIMPLE ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;



ALTER TABLE ONLY atomicmarket_template_buyoffers_assets
    ADD CONSTRAINT atomicmarket_template_buyoffers_assets_template_buyoffers_fkey FOREIGN KEY (market_contract, buyoffer_id)
    REFERENCES atomicmarket_template_buyoffers (market_contract, buyoffer_id) MATCH SIMPLE ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;


CREATE INDEX atomicmarket_template_buyoffers_buyoffer_id ON atomicmarket_template_buyoffers USING btree (buyoffer_id);
CREATE INDEX atomicmarket_template_buyoffers_seller ON atomicmarket_template_buyoffers USING hash (seller);
CREATE INDEX atomicmarket_template_buyoffers_buyer ON atomicmarket_template_buyoffers USING hash (buyer);
CREATE INDEX atomicmarket_template_buyoffers_price ON atomicmarket_template_buyoffers USING btree (price);
CREATE INDEX atomicmarket_template_buyoffers_collection_name ON atomicmarket_template_buyoffers USING btree (collection_name);
CREATE INDEX atomicmarket_template_buyoffers_template_id ON atomicmarket_template_buyoffers USING btree (template_id);
CREATE INDEX atomicmarket_template_buyoffers_state ON atomicmarket_template_buyoffers USING btree (state);
CREATE INDEX atomicmarket_template_buyoffers_updated_at_time ON atomicmarket_template_buyoffers USING btree (updated_at_time);
CREATE INDEX atomicmarket_template_buyoffers_created_at_time ON atomicmarket_template_buyoffers USING btree (created_at_time);

CREATE INDEX atomicmarket_template_buyoffers_assets_asset_id ON atomicmarket_template_buyoffers_assets USING btree (asset_id);

CREATE INDEX atomicmarket_template_buyoffers_missing_mint ON atomicmarket_template_buyoffers(assets_contract, buyoffer_id) WHERE template_mint IS NULL AND "state" = 2;




DROP FUNCTION IF EXISTS update_atomicmarket_stats_markets_by_template_buyoffer CASCADE;
CREATE OR REPLACE FUNCTION update_atomicmarket_stats_markets_by_template_buyoffer() RETURNS TRIGGER AS $$
DECLARE
    affects_stats_markets BOOLEAN;
BEGIN
    affects_stats_markets =
        (TG_OP IN ('INSERT', 'UPDATE') AND NEW.state = 2)
        OR
        (TG_OP IN ('DELETE', 'UPDATE') AND OLD.state = 2);
    IF (NOT affects_stats_markets)
    THEN RETURN NULL;
    END IF;

    INSERT INTO atomicmarket_stats_markets_updates(market_contract, listing_type, listing_id)
    VALUES (
        CASE TG_OP WHEN 'DELETE' THEN OLD.market_contract ELSE NEW.market_contract END,
        'template_buyoffer',
        CASE TG_OP WHEN 'DELETE' THEN OLD.buyoffer_id ELSE NEW.buyoffer_id END
    );

    RETURN NULL;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS atomicmarket_template_buyoffers_update_atomicmarket_stats_markets_tr ON atomicmarket_template_buyoffers;
CREATE TRIGGER atomicmarket_template_buyoffers_update_atomicmarket_stats_markets_tr
    AFTER UPDATE OR INSERT OR DELETE ON atomicmarket_template_buyoffers
    FOR EACH ROW
    EXECUTE FUNCTION update_atomicmarket_stats_markets_by_template_buyoffer();


DROP FUNCTION IF EXISTS update_atomicmarket_stats_market;
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

        UNION ALL

        SELECT
            t_buyoffer.market_contract, 'template_buyoffer' listing_type, t_buyoffer.buyoffer_id listing_id,
            t_buyoffer.buyer, t_buyoffer.seller, t_buyoffer.maker_marketplace, t_buyoffer.taker_marketplace,
            t_buyoffer.assets_contract, t_buyoffer.collection_name,
            t_buyoffer.token_symbol symbol, t_buyoffer.price, t_buyoffer.updated_at_time "time",
            CASE WHEN COUNT(*) = 1 THEN MIN(asset.schema_name) END AS schema_name,
            t_buyoffer.template_id,
            CASE WHEN COUNT(*) = 1 THEN MIN(asset.asset_id) END AS asset_id
        FROM atomicmarket_template_buyoffers t_buyoffer
            JOIN atomicmarket_template_buyoffers_assets t_buyoffer_asset ON t_buyoffer.buyoffer_id = t_buyoffer_asset.buyoffer_id AND t_buyoffer.assets_contract = t_buyoffer_asset.assets_contract
            JOIN atomicassets_assets asset ON t_buyoffer_asset.asset_id = asset.asset_id AND t_buyoffer_asset.assets_contract = asset.contract
        WHERE t_buyoffer.state = 2
            AND (t_buyoffer.market_contract, t_buyoffer.buyoffer_id) IN (
                SELECT market_contract, listing_id
                FROM changed_listings
                WHERE listing_type = 'template_buyoffer'
            )
        GROUP BY t_buyoffer.market_contract, t_buyoffer.buyoffer_id
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
