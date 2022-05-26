DROP VIEW IF EXISTS atomicmarket_template_prices_master CASCADE;

DROP TABLE IF EXISTS atomicmarket_template_prices CASCADE;
CREATE TABLE atomicmarket_template_prices (
	market_contract varchar(12) not null,
    assets_contract varchar(12) not null,
    collection_name varchar(12),
    template_id bigint not null,
    symbol varchar(12) not null,
	median bigint,
	average bigint,
	suggested_median bigint,
	suggested_average bigint,
	"min" bigint,
	"max" bigint,
	sales bigint
);


-- initialise with usable values
INSERT INTO atomicmarket_template_prices (market_contract, assets_contract, collection_name, template_id, symbol, median, average, suggested_median, suggested_average, "min", "max", sales)
    SELECT
        t2.market_contract, t2.assets_contract, t2.collection_name, t2.template_id, t2.symbol,
        PERCENTILE_DISC(0.5) WITHIN GROUP (ORDER BY t2.price) median,
        AVG(t2.price)::bigint average,
        PERCENTILE_DISC(0.5) WITHIN GROUP (ORDER BY t2.price) FILTER (WHERE t2.number <= 5 OR t2."time" / 1000 >= extract(epoch from now()) - 3600 * 24 * 3) suggested_median,
        (AVG(t2.price) FILTER (WHERE t2.number <= 5 OR t2."time" / 1000 >= extract(epoch from now()) - 3600 * 24 * 3))::bigint suggested_average,
        MIN(t2.price) "min", MAX(t2.price) "max", COUNT(*) sales
    FROM (
        SELECT
            t1.*, row_number() OVER (PARTITION BY t1.assets_contract, t1.collection_name, t1.template_id ORDER BY t1."time" DESC) "number"
        FROM atomicmarket_stats_prices_master t1
        WHERE t1.template_id IS NOT NULL
    ) t2
    GROUP BY t2.market_contract, t2.assets_contract, t2.collection_name, t2.template_id, t2.symbol
;



ALTER TABLE atomicmarket_template_prices
	ADD constraint atomicmarket_template_prices_pkey
		primary key (market_contract, assets_contract, collection_name, template_id, symbol);


create index atomicmarket_template_prices_collection_name on atomicmarket_template_prices (collection_name);
create index atomicmarket_template_prices_template_id on atomicmarket_template_prices (template_id);
create index atomicmarket_template_prices_median on atomicmarket_template_prices (median);
create index atomicmarket_template_prices_average on atomicmarket_template_prices (average);
create index atomicmarket_template_prices_suggested_median on atomicmarket_template_prices (suggested_median);
create index atomicmarket_template_prices_suggested_average on atomicmarket_template_prices (suggested_average);




CREATE INDEX IF NOT EXISTS atomicmarket_stats_markets_template_id_time ON atomicmarket_stats_markets (template_id, time);
DROP INDEX IF EXISTS atomicmarket_stats_markets_template_id;



DROP TABLE IF EXISTS atomicmarket_template_prices_updates;
CREATE TABLE atomicmarket_template_prices_updates(
    assets_contract VARCHAR(12),
    template_id BIGINT NOT NULL,
    refresh_at BIGINT NOT NULL DEFAULT 0
);

INSERT INTO atomicmarket_template_prices_updates(assets_contract, template_id)
	SELECT DISTINCT assets_contract, template_id
	FROM atomicmarket_stats_prices_master
	WHERE template_id IS NOT NULL
;
INSERT INTO atomicmarket_template_prices_updates(assets_contract, template_id, refresh_at)
	SELECT assets_contract, template_id, l.updated_at_time + (3600 * 24 * 3 * 1000)
	FROM atomicmarket_sales_filters_listed l
	    JOIN atomicassets_assets aa ON l.asset_ids[1] = aa.asset_id
	WHERE array_length(asset_ids, 1) = 1
	    AND aa.template_id IS NOT NULL
	    AND l.updated_at_time + (3600 * 24 * 3 * 1000) >= (SELECT MAX(block_time) FROM contract_readers)
;

DROP FUNCTION IF EXISTS update_atomicmarket_template_prices_by_sale CASCADE;
CREATE OR REPLACE FUNCTION update_atomicmarket_template_prices_by_sale() RETURNS TRIGGER AS $$
DECLARE
    affects_template_prices BOOLEAN;
    template_id BIGINT;
BEGIN
    SELECT SUBSTRING(f FROM 2)::BIGINT
    INTO template_id
    FROM UNNEST(CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN NEW.filter ELSE OLD.filter END) u(f)
    WHERE f LIKE 't%'
    LIMIT 1;

    affects_template_prices =
        (TG_OP = 'INSERT' AND template_id IS NOT NULL AND NEW.seller_contract IS DISTINCT FROM TRUE)
        OR
        (TG_OP = 'UPDATE' AND template_id IS NOT NULL AND NEW.seller_contract IS DISTINCT FROM TRUE AND OLD.price IS DISTINCT FROM NEW.price)
        OR
        (TG_OP = 'DELETE' AND template_id IS NOT NULL AND OLD.seller_contract IS DISTINCT FROM TRUE);
    IF (NOT affects_template_prices)
    THEN RETURN NULL;
    END IF;

    INSERT INTO atomicmarket_template_prices_updates(assets_contract, template_id)
    VALUES (
        CASE TG_OP WHEN 'DELETE' THEN OLD.assets_contract ELSE NEW.assets_contract END,
        template_id
    );

    IF (TG_OP IN ('INSERT', 'UPDATE'))
    THEN
        INSERT INTO atomicmarket_template_prices_updates(assets_contract, template_id, refresh_at)
        VALUES (
            NEW.assets_contract,
            template_id,
            NEW.updated_at_time + (3600 * 24 * 3 * 1000) -- trigger refresh 3 days after this sale was updated
        );
    END IF;

    RETURN NULL;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS atomicmarket_sales_filters_listed_update_template_prices_tr ON atomicmarket_sales;
CREATE TRIGGER atomicmarket_sales_filters_listed_update_template_prices_tr
    AFTER UPDATE OR INSERT OR DELETE ON atomicmarket_sales_filters_listed
    FOR EACH ROW
    EXECUTE FUNCTION update_atomicmarket_template_prices_by_sale();


DROP FUNCTION IF EXISTS update_atomicmarket_template_prices_by_stats_markets CASCADE;
CREATE OR REPLACE FUNCTION update_atomicmarket_template_prices_by_stats_markets() RETURNS TRIGGER AS $$
DECLARE
    affects_template_prices BOOLEAN;
BEGIN
    affects_template_prices =
        (TG_OP IN ('INSERT', 'UPDATE') AND NEW.asset_id IS NOT NULL AND NEW.template_id IS NOT NULL)
        OR
        (TG_OP IN ('DELETE', 'UPDATE') AND OLD.asset_id IS NOT NULL AND OLD.template_id IS NOT NULL);
    IF (NOT affects_template_prices)
    THEN RETURN NULL;
    END IF;

    INSERT INTO atomicmarket_template_prices_updates(assets_contract, template_id)
    VALUES (
        CASE TG_OP WHEN 'DELETE' THEN OLD.assets_contract ELSE NEW.assets_contract END,
        CASE TG_OP WHEN 'DELETE' THEN OLD.template_id ELSE NEW.template_id END
    );

    RETURN NULL;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS atomicmarket_stats_markets_update_template_prices_tr ON atomicmarket_stats_markets;
CREATE TRIGGER atomicmarket_stats_markets_update_template_prices_tr
    AFTER UPDATE OR INSERT OR DELETE ON atomicmarket_stats_markets
    FOR EACH ROW
    EXECUTE FUNCTION update_atomicmarket_template_prices_by_stats_markets();

DROP FUNCTION IF EXISTS update_atomicmarket_template_prices;
CREATE OR REPLACE FUNCTION update_atomicmarket_template_prices() RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
    result INT = 0;
    temp INT;
    rec RECORD;
    _suggested_median BIGINT;
    _suggested_average BIGINT;
    current_block_time BIGINT = (SELECT MAX(block_time) FROM contract_readers);
BEGIN
    FOR rec IN
        WITH updates AS (
			DELETE FROM atomicmarket_template_prices_updates
			WHERE refresh_at <= current_block_time
			RETURNING assets_contract, template_id
        )
		SELECT DISTINCT assets_contract, template_id
		FROM updates
	LOOP
		SELECT
			PERCENTILE_DISC(0.5) WITHIN GROUP (ORDER BY price) suggested_median,
			AVG(price)::BIGINT suggested_average
		INTO _suggested_median, _suggested_average
		FROM (
		        (
                    SELECT listing_id /* not used but required to prevent the same price being discarded in the union*/, price
                    FROM atomicmarket_stats_prices_master
                    WHERE template_id = rec.template_id AND assets_contract = rec.assets_contract
                        AND time >= ((extract(epoch from now() - '3 days'::INTERVAL)) * 1000)::BIGINT
				)
				UNION
				(
                    SELECT listing_id, price
                    FROM atomicmarket_stats_prices_master
                    WHERE template_id = rec.template_id AND assets_contract = rec.assets_contract
                    ORDER BY time DESC
                    LIMIT 5
				)
			) prices
		;

        -- '+ 0' to prevent wrong index usage
        SELECT LEAST(MIN(price + 0), _suggested_median), LEAST(MIN(price + 0), _suggested_average)
		INTO _suggested_median, _suggested_average
		FROM atomicmarket_sales_filters_listed
		WHERE filter && create_atomicmarket_sales_filter(ARRAY[rec.template_id])
		    AND assets_contract = rec.assets_contract
		    AND seller_contract IS DISTINCT FROM TRUE
		    AND updated_at_time + 0 <= (current_block_time - 3600 * 24 * 3 * 1000); -- older than 3 days

		IF (_suggested_median IS NULL)
		THEN
			DELETE FROM atomicmarket_template_prices
			WHERE template_id = rec.template_id AND assets_contract = rec.assets_contract;
			result = result + 1;
			CONTINUE;
		END IF;

		INSERT INTO atomicmarket_template_prices AS tp (market_contract, assets_contract, collection_name, template_id, symbol,
    			median, average, suggested_median, suggested_average, "min", "max", sales)
			SELECT
				market_contract, assets_contract, collection_name, template_id, symbol,
				PERCENTILE_DISC(0.5) WITHIN GROUP (ORDER BY price) median,
				AVG(price)::bigint average,
				_suggested_median,
				_suggested_average,
				MIN(price) "min", MAX(price) "max", COUNT(*) sales
			FROM atomicmarket_stats_prices_master
			WHERE template_id = rec.template_id AND assets_contract = rec.assets_contract
			GROUP BY market_contract, assets_contract, collection_name, template_id, symbol
		ON CONFLICT (market_contract, assets_contract, collection_name, template_id, symbol)
			DO UPDATE SET
				median = EXCLUDED.median,
				average = EXCLUDED.average,
				suggested_median = EXCLUDED.suggested_median,
				suggested_average = EXCLUDED.suggested_average,
				"min" = EXCLUDED."min",
				"max" = EXCLUDED."max",
				sales = EXCLUDED.sales
			WHERE tp.median IS DISTINCT FROM EXCLUDED.median
				OR tp.average IS DISTINCT FROM EXCLUDED.average
				OR tp.suggested_median IS DISTINCT FROM EXCLUDED.suggested_median
				OR tp."min" IS DISTINCT FROM EXCLUDED."min"
				OR tp."max" IS DISTINCT FROM EXCLUDED."max"
				OR tp.sales IS DISTINCT FROM EXCLUDED.sales
		;

        GET DIAGNOSTICS temp = ROW_COUNT;
		result = result + temp;
	END LOOP;

    RETURN result;
END
$$;

