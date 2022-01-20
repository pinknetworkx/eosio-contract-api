
CREATE OR REPLACE FUNCTION atomicmarket_get_sale_state(sale_state SMALLINT, offer_state SMALLINT) RETURNS SMALLINT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
    SELECT
        CASE
			WHEN (sale_state = 0) THEN 0
			WHEN (sale_state = 1 AND offer_state = 0) THEN 1
			WHEN (sale_state = 2) THEN 2
			WHEN (sale_state = 3) THEN 3
			WHEN (sale_state = 1 AND offer_state != 0) THEN 4
		END::SMALLINT
$$;
