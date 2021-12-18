DROP INDEX IF EXISTS atomicmarket_sales_filters_asset_names_idx;
CREATE INDEX atomicmarket_sales_filters_asset_names_idx ON atomicmarket_sales_filters USING gin(asset_names gin_trgm_ops);

ANALYSE atomicmarket_sales_filters_asset_names_idx;

CREATE OR REPLACE FUNCTION atomicmarket_get_sale_state(sale_state SMALLINT, offer_state SMALLINT) RETURNS SMALLINT
LANGUAGE sql
IMMUTABLE
AS $$
-- TODO update update_atomicmarket_sales_filters to use this function
    SELECT
        CASE
			WHEN (sale_state = 0) THEN 0
			WHEN (sale_state = 1 AND offer_state = 0) THEN 1
			WHEN (sale_state = 2) THEN 2
			WHEN (sale_state = 3) THEN 3
			WHEN (sale_state = 1 AND offer_state != 0) THEN 4
		END
$$;
