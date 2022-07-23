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


ALTER TABLE atomicmarket_template_prices
	ADD constraint atomicmarket_template_prices_pkey
		primary key (market_contract, assets_contract, collection_name, template_id, symbol);


CREATE INDEX IF NOT EXISTS atomicmarket_stats_markets_template_id_time ON atomicmarket_stats_markets (template_id, time);
DROP INDEX IF EXISTS atomicmarket_stats_markets_template_id;


DROP FUNCTION IF EXISTS update_atomicmarket_template_prices;
CREATE OR REPLACE FUNCTION update_atomicmarket_template_prices() RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
    result INT = 0;
    temp INT;
    rec RECORD;
    current_block_time BIGINT = (SELECT MAX(block_time) FROM contract_readers);
BEGIN
    FOR rec IN
        WITH templates AS MATERIALIZED (
            SELECT DISTINCT template_id, assets_contract
            FROM atomicmarket_stats_prices_master
            WHERE template_id IS NOT NULL
        ), sales AS MATERIALIZED (
            SELECT assets_contract, SUBSTRING(f FROM 2)::BIGINT template_id, MIN(price) min_price
            FROM atomicmarket_sales_filters_listed
                JOIN LATERAL UNNEST(filter) u(f) ON u.f LIKE 't%'
            WHERE seller_contract IS DISTINCT FROM TRUE
                AND asset_count = 1
        	    AND updated_at_time + 0 <= (current_block_time - 3600 * 24 * 3 * 1000) -- only include sales older than 3 days
            GROUP BY template_id, assets_contract
        )
        SELECT template_id, assets_contract, sug.suggested_median, sug.suggested_average
        FROM templates
            LEFT OUTER JOIN sales USING (template_id, assets_contract)
            CROSS JOIN LATERAL (
                SELECT
                    LEAST(PERCENTILE_DISC(0.5) WITHIN GROUP (ORDER BY price), sales.min_price) suggested_median,
                    LEAST(AVG(price)::BIGINT, sales.min_price) suggested_average
                FROM (
                        (
                            SELECT listing_id /* not used, but required to prevent the same price being discarded in the union*/, price
                            FROM atomicmarket_stats_prices_master
                            WHERE template_id = templates.template_id AND assets_contract = templates.assets_contract
                                AND time >= ((extract(epoch from now() - '3 days'::INTERVAL)) * 1000)::BIGINT
                        )
                        UNION
                        (
                            SELECT listing_id, price
                            FROM atomicmarket_stats_prices_master
                            WHERE template_id = templates.template_id AND assets_contract = templates.assets_contract
                            ORDER BY time DESC
                            LIMIT 5
                        )
                    ) prices
            ) sug
	LOOP
		INSERT INTO atomicmarket_template_prices AS tp (market_contract, assets_contract, collection_name, template_id, symbol,
    			median, average, suggested_median, suggested_average, "min", "max", sales)
			SELECT
				market_contract, assets_contract, collection_name, template_id, symbol,
				PERCENTILE_DISC(0.5) WITHIN GROUP (ORDER BY price) median,
				AVG(price)::bigint average,
				rec.suggested_median,
				rec.suggested_average,
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

    IF (random() <= 0.05) -- occasionally, remove deleted templates
    THEN
        DELETE FROM atomicmarket_template_prices
        WHERE (template_id, assets_contract) NOT IN (
            SELECT DISTINCT template_id, assets_contract
            FROM atomicmarket_stats_prices_master
            WHERE template_id IS NOT NULL
        );
        GET DIAGNOSTICS temp = ROW_COUNT;
		result = result + temp;
    END IF;

    RETURN result;
END
$$;

SELECT update_atomicmarket_template_prices();

create index atomicmarket_template_prices_collection_name on atomicmarket_template_prices (collection_name);
create index atomicmarket_template_prices_template_id on atomicmarket_template_prices (template_id);

