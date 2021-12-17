CREATE EXTENSION IF NOT EXISTS pg_trgm;

DROP TABLE IF EXISTS atomicmarket_sales_filters CASCADE;
CREATE TABLE atomicmarket_sales_filters (
    sale_id BIGINT NOT NULL,
    created_at_block BIGINT NOT NULL,
    offer_id BIGINT NOT NULL,
    price BIGINT,
    asset_count INT,
	updated_at_time BIGINT NOT NULL,
	created_at_time BIGINT NOT NULL,
    sale_state SMALLINT NOT NULL,
    filter TEXT[],
    asset_ids BIGINT[],
    asset_names TEXT,
    market_contract VARCHAR(12) NOT NULL,
    settlement_symbol VARCHAR(12),
    template_mint int4range,
    assets_contract VARCHAR(12) NOT NULL,
	maker_marketplace VARCHAR(12) NOT NULL,
	taker_marketplace VARCHAR(12)
)
PARTITION BY LIST (sale_state);

ALTER TABLE atomicmarket_sales_filters ADD COLUMN variable_price BOOLEAN;
ALTER TABLE atomicmarket_sales_filters ADD COLUMN seller_contract BOOLEAN;
ALTER TABLE atomicmarket_sales_filters ADD COLUMN b3 BOOLEAN;
ALTER TABLE atomicmarket_sales_filters ADD COLUMN b4 BOOLEAN;
ALTER TABLE atomicmarket_sales_filters ADD COLUMN b5 BOOLEAN;
ALTER TABLE atomicmarket_sales_filters ADD COLUMN b6 BOOLEAN;
ALTER TABLE atomicmarket_sales_filters ADD COLUMN b7 BOOLEAN;

ALTER TABLE atomicmarket_sales_filters ADD CONSTRAINT atomicmarket_sales_filters_pkey PRIMARY KEY (sale_state, market_contract, sale_id);

CREATE OR REPLACE FUNCTION calc_listing_price(final_price BIGINT, listing_price BIGINT, invert_delphi_pair BOOLEAN, delphi_median BIGINT, delphi_quote_precision INT, delphi_base_precision INT, delphi_median_precision INT) RETURNS BIGINT
LANGUAGE sql
IMMUTABLE
AS $$
-- TODO update atomicmarket_sale_prices_master to use this function?
    SELECT
        CASE
            WHEN final_price IS NOT NULL THEN final_price
            WHEN invert_delphi_pair THEN LEAST(listing_price::numeric * delphi_median::numeric * power(10.0, (delphi_quote_precision - delphi_base_precision - delphi_median_precision)::numeric), '9223372036854775807'::bigint::numeric)::bigint
            WHEN NOT invert_delphi_pair THEN LEAST(listing_price::numeric / delphi_median::numeric * power(10.0, (delphi_median_precision + delphi_base_precision - delphi_quote_precision)::numeric), '9223372036854775807'::bigint::numeric)::bigint
            ELSE listing_price
        END
$$;

DROP FUNCTION IF EXISTS create_atomicmarket_sales_filter CASCADE;
CREATE OR REPLACE FUNCTION create_atomicmarket_sales_filter(
    template_ids BIGINT[] = NULL,
    collection_names TEXT[] = NULL,
    data TEXT[] = NULL,
    schema_names TEXT [] = NULL,
    sellers TEXT[] = NULL,
    buyers TEXT[] = NULL,
    owners TEXT[] = NULL,
    flags TEXT[] = NULL
) RETURNS TEXT []
LANGUAGE sql
IMMUTABLE
AS $$
SELECT
    ARRAY[]::TEXT[]
    || (SELECT ARRAY_AGG(DISTINCT 'c' || unnest) FROM UNNEST(collection_names) WHERE unnest IS NOT NULL) -- has to be at this position because the collection is accessed by index
    || (SELECT ARRAY_AGG(DISTINCT 'e' || unnest) FROM UNNEST(sellers) WHERE unnest IS NOT NULL) -- has to be at this position because the seller is accessed by index
    || (SELECT ARRAY_AGG(DISTINCT 't' || unnest) FROM UNNEST(template_ids) WHERE unnest IS NOT NULL)
    || (SELECT ARRAY_AGG(DISTINCT 'd' || unnest) FROM UNNEST(data) WHERE unnest IS NOT NULL)
    || (SELECT ARRAY_AGG(DISTINCT 's' || unnest) FROM UNNEST(schema_names) WHERE unnest IS NOT NULL)
    || (SELECT ARRAY_AGG(DISTINCT 'b' || unnest) FROM UNNEST(buyers) WHERE unnest IS NOT NULL)
    || (SELECT ARRAY_AGG(DISTINCT 'o' || unnest) FROM UNNEST(owners) WHERE unnest IS NOT NULL)
    || (SELECT ARRAY_AGG(DISTINCT 'f' || unnest) FROM UNNEST(flags) WHERE unnest IS NOT NULL)
$$;

DROP TABLE IF EXISTS atomicmarket_sales_filters_updates;
CREATE TABLE atomicmarket_sales_filters_updates(
    market_contract VARCHAR(12),
    asset_contract VARCHAR(12),
    sale_id BIGINT,
    asset_id BIGINT,
    offer_id BIGINT
);

CREATE OR REPLACE FUNCTION refresh_atomicmarket_sales_filters_price() RETURNS VOID
LANGUAGE sql
AS $$
	INSERT INTO atomicmarket_sales_filters_updates (market_contract, sale_id)
		SELECT market_contract, sale_id
		FROM atomicmarket_sales_filters
		WHERE sale_state = 1 /* listing */
			AND variable_price
$$;

DROP FUNCTION IF EXISTS update_atomicmarket_sales_filters;
CREATE OR REPLACE FUNCTION update_atomicmarket_sales_filters() RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
    result INT;
    r RECORD;
BEGIN
    CREATE TEMPORARY TABLE sales_to_update (sale_id INT NOT NULL, market_contract TEXT NOT NULL, PRIMARY KEY (sale_id, market_contract));

    FOR r IN
        WITH assets AS (
            DELETE FROM atomicmarket_sales_filters_updates u
            WHERE u.asset_id IS NOT NULL
            RETURNING asset_contract, asset_id
        ), assets_with_bucket AS (
            SELECT asset_contract, asset_id, ROW_NUMBER() OVER () / 50 bucket
            FROM (
                SELECT DISTINCT asset_contract, asset_id
                FROM assets
            ) d
        )
        SELECT asset_contract, ARRAY_AGG(asset_id) asset_ids
        FROM assets_with_bucket
        GROUP BY asset_contract, bucket
    LOOP
        INSERT INTO sales_to_update (sale_id, market_contract)
            SELECT m.sale_id, m.market_contract
            FROM atomicmarket_sales_filters m
            WHERE m.assets_contract = r.asset_contract
            	AND m.asset_ids && r.asset_ids
        ON CONFLICT DO NOTHING
        ;
    END LOOP;

    WITH sales AS (
        DELETE FROM atomicmarket_sales_filters_updates u
        WHERE u.sale_id IS NOT NULL
        RETURNING market_contract, sale_id
    ), offers AS (
        DELETE FROM atomicmarket_sales_filters_updates u
        WHERE u.offer_id IS NOT NULL
        RETURNING asset_contract, offer_id
    ), all_sales_to_update AS MATERIALIZED (
        SELECT market_contract, sale_id
        FROM sales
        UNION
        SELECT market_contract, sale_id
        FROM sales_to_update
        UNION
        SELECT m.market_contract, m.sale_id
        FROM atomicmarket_sales_filters m
            JOIN offers o ON m.assets_contract = o.asset_contract
                AND m.offer_id = o.offer_id
    ), sales_to_insert_or_update AS MATERIALIZED (
        SELECT
            listing.sale_id,
            listing.created_at_block,
            listing.offer_id,
            MIN(calc_listing_price(listing.final_price, listing.listing_price, pair.invert_delphi_pair, delphi.median, delphi.quote_precision, delphi.base_precision, delphi.median_precision)) AS price,
            CASE WHEN BOOL_OR(pair.invert_delphi_pair) IS NOT NULL THEN TRUE END variable_price,

            COUNT(DISTINCT asset.asset_id) asset_count,
            CASE
                WHEN (listing.state = 0) THEN 0
                WHEN (listing.state = 1 AND offer.state = 0) THEN 1
--                WHEN (listing.state = 2) THEN 2
                WHEN (listing.state = 3) THEN 3
                WHEN (listing.state = 1 AND offer.state != 0) THEN 4
            END sale_state,

            create_atomicmarket_sales_filter(
                template_ids := ARRAY_AGG(DISTINCT asset.template_id) FILTER (WHERE asset.template_id IS NOT NULL),
                collection_names := ARRAY[listing.collection_name],
                data := ARRAY_AGG(DISTINCT data_props.ky || ':' || (data_props.val#>> '{}')) FILTER (WHERE data_props.ky NOT IN ('name', 'img') AND LENGTH(data_props.val#>> '{}') < 60),
                schema_names := ARRAY_AGG(DISTINCT asset.schema_name),
                sellers := ARRAY[listing.seller],
                buyers := ARRAY[listing.buyer],
                owners := ARRAY_AGG(DISTINCT asset.owner) FILTER (WHERE asset.owner IS NOT NULL),
                flags := CASE WHEN COUNT(asset.owner) FILTER (WHERE asset.owner IS NOT NULL) = 0 THEN ARRAY['b'] END -- burned
                	|| CASE WHEN COUNT(asset.template_id) FILTER (WHERE asset.template_id IS NOT NULL) = 0 THEN ARRAY['nt'] END -- no template
                	|| CASE WHEN BOOL_AND(template.transferable) IS DISTINCT FROM TRUE THEN ARRAY['nx'] END -- not transferable
                	|| CASE WHEN BOOL_AND(template.burnable) IS DISTINCT FROM TRUE THEN ARRAY['nb'] END -- not burnable
            ) AS filter,

    		ARRAY_AGG(DISTINCT asset.asset_id) asset_ids,

            STRING_AGG(DISTINCT (data_props.val#>> '{}'), e'\n') FILTER (WHERE data_props.ky = 'name') asset_names,

            listing.market_contract,
            listing.settlement_symbol,

            CASE WHEN MIN(asset.template_mint) IS NULL THEN 'empty'::int4range ELSE int4range(MIN(asset.template_mint), MAX(asset.template_mint), '[]') END AS template_mint,

            listing.assets_contract,

            listing.maker_marketplace,
            listing.taker_marketplace,
            listing.updated_at_time,
            listing.created_at_time,
            CASE WHEN cc.account IS NOT NULL THEN TRUE END seller_contract

        FROM atomicmarket_sales listing
            JOIN all_sales_to_update stu ON listing.market_contract = stu.market_contract AND listing.sale_id = stu.sale_id
            JOIN atomicassets_offers offer ON (listing.assets_contract = offer.contract AND listing.offer_id = offer.offer_id)
            JOIN atomicassets_offers_assets offer_asset ON offer_asset.offer_id = listing.offer_id AND offer_asset.contract = listing.assets_contract
            JOIN atomicassets_assets asset ON asset.contract = offer_asset.contract AND asset.asset_id = offer_asset.asset_id
            LEFT OUTER JOIN atomicassets_templates template ON asset.template_id = template.template_id AND asset.contract = template.contract

            LEFT OUTER JOIN atomicmarket_symbol_pairs pair ON pair.market_contract = listing.market_contract AND pair.listing_symbol = listing.listing_symbol AND pair.settlement_symbol = listing.settlement_symbol
            LEFT OUTER JOIN delphioracle_pairs delphi ON pair.delphi_contract = delphi.contract AND pair.delphi_pair_name = delphi.delphi_pair_name

            LEFT OUTER JOIN contract_codes cc ON listing.seller = cc.account

            LEFT OUTER JOIN LATERAL jsonb_each(COALESCE(asset.mutable_data, '{}') || COALESCE(asset.immutable_data, '{}') || COALESCE(template.immutable_data, '{}')) AS data_props(ky, val) ON TRUE
        WHERE (listing.state != 2) -- exclude cancelled
        GROUP BY listing.market_contract, listing.sale_id, sale_state, cc.account
    ), ins_upd AS (
        INSERT INTO atomicmarket_sales_filters AS m (sale_id, created_at_block, offer_id, price, variable_price,
            asset_count, sale_state, filter, asset_ids, asset_names, market_contract,
            settlement_symbol, template_mint, assets_contract,
            maker_marketplace, taker_marketplace, updated_at_time, created_at_time,
            seller_contract
        )
            SELECT
                sale_id, created_at_block, offer_id, price, variable_price,
                asset_count, sale_state, filter, asset_ids, asset_names, market_contract,
                settlement_symbol, template_mint, assets_contract,
                maker_marketplace, taker_marketplace, updated_at_time, created_at_time,
                seller_contract
            FROM sales_to_insert_or_update
        ON CONFLICT (sale_state, market_contract, sale_id)
            DO UPDATE SET
                created_at_block = EXCLUDED.created_at_block,
                offer_id = EXCLUDED.offer_id,
                price = EXCLUDED.price,
                variable_price = EXCLUDED.variable_price,
                asset_count = EXCLUDED.asset_count,
                filter = EXCLUDED.filter,
                asset_ids = EXCLUDED.asset_ids,
                asset_names = EXCLUDED.asset_names,
                settlement_symbol = EXCLUDED.settlement_symbol,
                template_mint = EXCLUDED.template_mint,
                assets_contract = EXCLUDED.assets_contract,
                maker_marketplace = EXCLUDED.maker_marketplace,
                taker_marketplace = EXCLUDED.taker_marketplace,
                updated_at_time = EXCLUDED.updated_at_time,
                created_at_time = EXCLUDED.created_at_time,
                seller_contract = EXCLUDED.seller_contract
            WHERE
                m.created_at_block IS DISTINCT FROM EXCLUDED.created_at_block
                OR m.offer_id IS DISTINCT FROM EXCLUDED.offer_id
                OR m.price IS DISTINCT FROM EXCLUDED.price
                OR m.variable_price IS DISTINCT FROM EXCLUDED.variable_price
                OR m.asset_count IS DISTINCT FROM EXCLUDED.asset_count
                OR m.filter IS DISTINCT FROM EXCLUDED.filter
                OR m.asset_ids IS DISTINCT FROM EXCLUDED.asset_ids
                OR m.asset_names IS DISTINCT FROM EXCLUDED.asset_names
                OR m.settlement_symbol IS DISTINCT FROM EXCLUDED.settlement_symbol
                OR m.template_mint IS DISTINCT FROM EXCLUDED.template_mint
                OR m.assets_contract IS DISTINCT FROM EXCLUDED.assets_contract
                OR m.maker_marketplace IS DISTINCT FROM EXCLUDED.maker_marketplace
                OR m.taker_marketplace IS DISTINCT FROM EXCLUDED.taker_marketplace
                OR m.updated_at_time IS DISTINCT FROM EXCLUDED.updated_at_time
                OR m.created_at_time IS DISTINCT FROM EXCLUDED.created_at_time
                OR m.seller_contract IS DISTINCT FROM EXCLUDED.seller_contract
        RETURNING 1
    ), del AS (
        DELETE FROM atomicmarket_sales_filters
        WHERE (market_contract, sale_id) IN (
            SELECT market_contract, sale_id FROM all_sales_to_update
            EXCEPT
            SELECT market_contract, sale_id FROM sales_to_insert_or_update
        )
        RETURNING 1
    )
    SELECT COALESCE((SELECT COUNT(*) FROM ins_upd), 0)
        + COALESCE((SELECT COUNT(*) FROM del), 0)
    INTO result;

    DROP TABLE sales_to_update;

    RETURN result;
END
$$;

CREATE TABLE atomicmarket_sales_filters_waiting (LIKE atomicmarket_sales_filters);
ALTER TABLE atomicmarket_sales_filters ATTACH PARTITION atomicmarket_sales_filters_waiting FOR VALUES IN (0);

CREATE TABLE atomicmarket_sales_filters_listed (LIKE atomicmarket_sales_filters);
ALTER TABLE atomicmarket_sales_filters ATTACH PARTITION atomicmarket_sales_filters_listed FOR VALUES IN (1);

CREATE INDEX atomicmarket_sales_filters_listed_variable_price ON atomicmarket_sales_filters_listed(sale_id) WHERE variable_price;


/*
CREATE TABLE atomicmarket_sales_filters_cancelled (LIKE atomicmarket_sales_filters);
ALTER TABLE atomicmarket_sales_filters ATTACH PARTITION atomicmarket_sales_filters_cancelled FOR VALUES IN (2);
*/

CREATE TABLE atomicmarket_sales_filters_sold (LIKE atomicmarket_sales_filters);
ALTER TABLE atomicmarket_sales_filters ATTACH PARTITION atomicmarket_sales_filters_sold FOR VALUES IN (3);

CREATE TABLE atomicmarket_sales_filters_invalid (LIKE atomicmarket_sales_filters);
ALTER TABLE atomicmarket_sales_filters ATTACH PARTITION atomicmarket_sales_filters_invalid FOR VALUES IN (4);


LOCK TABLE atomicmarket_sales, atomicassets_offers, atomicassets_offers_assets, atomicassets_assets IN EXCLUSIVE MODE;

INSERT INTO atomicmarket_sales_filters_updates(market_contract, sale_id)
    SELECT listing.market_contract, listing.sale_id
    FROM atomicmarket_sales listing
        JOIN atomicassets_offers offer ON (listing.assets_contract = offer.contract AND listing.offer_id = offer.offer_id)
    WHERE
        CASE
            WHEN (listing.state = 0) THEN 0
            WHEN (listing.state = 1 AND offer.state = 0) THEN 1
            WHEN (listing.state = 2) THEN 2
            WHEN (listing.state = 3) THEN 3
            WHEN (listing.state = 1 AND offer.state != 0) THEN 4
        END IN (0, 1, /*2,*/ 3, 4)
;

DROP FUNCTION IF EXISTS update_atomicmarket_sales_filters_by_asset CASCADE;
CREATE OR REPLACE FUNCTION update_atomicmarket_sales_filters_by_asset() RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO atomicmarket_sales_filters_updates(asset_contract, asset_id)
    VALUES (
        CASE TG_OP WHEN 'DELETE' THEN OLD.contract ELSE NEW.contract END,
        CASE TG_OP WHEN 'DELETE' THEN OLD.asset_id ELSE NEW.asset_id END
    );

    RETURN NULL;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS atomicassets_assets_update_atomicmarket_sales_filters_tr ON atomicassets_assets;
CREATE TRIGGER atomicassets_assets_update_atomicmarket_sales_filters_tr
    AFTER UPDATE OR INSERT OR DELETE ON atomicassets_assets
    FOR EACH ROW
    EXECUTE FUNCTION update_atomicmarket_sales_filters_by_asset();


DROP FUNCTION IF EXISTS update_atomicmarket_sales_filters_by_offer CASCADE;
CREATE OR REPLACE FUNCTION update_atomicmarket_sales_filters_by_offer() RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO atomicmarket_sales_filters_updates(asset_contract, offer_id)
    VALUES (
        CASE TG_OP WHEN 'DELETE' THEN OLD.contract ELSE NEW.contract END,
        CASE TG_OP WHEN 'DELETE' THEN OLD.offer_id ELSE NEW.offer_id END
    );

    RETURN NULL;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS atomicassets_offers_update_atomicmarket_sales_filters_tr ON atomicassets_offers;
CREATE TRIGGER atomicassets_offers_update_atomicmarket_sales_filters_tr
    AFTER UPDATE OR INSERT OR DELETE ON atomicassets_offers
    FOR EACH ROW
    EXECUTE FUNCTION update_atomicmarket_sales_filters_by_offer();


DROP FUNCTION IF EXISTS update_atomicmarket_sales_filters_by_sale CASCADE;
CREATE OR REPLACE FUNCTION update_atomicmarket_sales_filters_by_sale() RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO atomicmarket_sales_filters_updates(market_contract, sale_id)
    VALUES (
        CASE TG_OP WHEN 'DELETE' THEN OLD.market_contract ELSE NEW.market_contract END,
        CASE TG_OP WHEN 'DELETE' THEN OLD.sale_id ELSE NEW.sale_id END
    );

    RETURN NULL;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS atomicmarket_sales_update_atomicmarket_sales_filters_tr ON atomicmarket_sales;
CREATE TRIGGER atomicmarket_sales_update_atomicmarket_sales_filters_tr
    AFTER UPDATE OR INSERT OR DELETE ON atomicmarket_sales
    FOR EACH ROW
    EXECUTE FUNCTION update_atomicmarket_sales_filters_by_sale();

DROP FUNCTION IF EXISTS update_atomicmarket_sales_filters_by_contract_code CASCADE;
CREATE OR REPLACE FUNCTION update_atomicmarket_sales_filters_by_contract_code() RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO atomicmarket_sales_filters_updates(market_contract, sale_id)
    	SELECT market_contract, sale_id
    	FROM atomicmarket_sales
    	WHERE seller = ANY(ARRAY[
    		CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN NEW.account END,
    		CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN OLD.account END
		]);

    RETURN NULL;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS atomicmarket_contract_update_atomicmarket_sales_filters_tr ON atomicmarket_sales;
CREATE TRIGGER atomicmarket_contract_update_atomicmarket_sales_filters_tr
    AFTER UPDATE OR INSERT OR DELETE ON contract_codes
    FOR EACH ROW
    EXECUTE FUNCTION update_atomicmarket_sales_filters_by_contract_code();

CREATE INDEX market_sales_updates_sale_id ON atomicmarket_sales_filters_updates (market_contract, sale_id) WHERE sale_id IS NOT NULL;
CREATE INDEX market_sales_updates_asset_id ON atomicmarket_sales_filters_updates (asset_contract, asset_id) WHERE asset_id IS NOT NULL;
CREATE INDEX market_sales_updates_offer_id ON atomicmarket_sales_filters_updates (asset_contract, offer_id) WHERE offer_id IS NOT NULL;

SELECT update_atomicmarket_sales_filters();


CREATE INDEX atomicmarket_sales_filters_filter_idx ON atomicmarket_sales_filters USING gin(filter);
CREATE INDEX atomicmarket_sales_filters_asset_ids_idx ON atomicmarket_sales_filters USING gin(asset_ids);
-- 1.3.1 CREATE INDEX atomicmarket_sales_filters_asset_names_idx ON atomicmarket_sales_filters USING gist(asset_names gist_trgm_ops);
CREATE INDEX atomicmarket_sales_filters_offer_id_idx ON atomicmarket_sales_filters (offer_id);

CREATE INDEX atomicmarket_sales_filters_updated_at_time_idx ON atomicmarket_sales_filters (updated_at_time);
CREATE INDEX atomicmarket_sales_filters_created_at_time_idx ON atomicmarket_sales_filters (created_at_time);
CREATE INDEX atomicmarket_sales_filters_mint_order_idx ON atomicmarket_sales_filters (LOWER(template_mint)) WHERE LOWER(template_mint) IS NOT NULL;
CREATE INDEX atomicmarket_sales_filters_price_idx ON atomicmarket_sales_filters (price);

ANALYSE atomicmarket_sales_filters;
