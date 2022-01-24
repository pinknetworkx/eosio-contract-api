DROP INDEX IF EXISTS atomicmarket_sales_filters_asset_names_idx;
CREATE INDEX atomicmarket_sales_filters_asset_names_idx ON atomicmarket_sales_filters USING gin(asset_names gin_trgm_ops);

ANALYSE atomicmarket_sales_filters_asset_names_idx;

CREATE OR REPLACE FUNCTION atomicmarket_get_sale_state(sale_state SMALLINT, offer_state SMALLINT) RETURNS SMALLINT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
-- TODO update update_atomicmarket_sales_filters to use this function
    SELECT
        CASE
			WHEN (sale_state = 0) THEN 0
			WHEN (sale_state = 1 AND offer_state = 0) THEN 1
			WHEN (sale_state = 2) THEN 2
			WHEN (sale_state = 3) THEN 3
			WHEN (sale_state = 1 AND offer_state != 0) THEN 4
		END::SMALLINT
$$;

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
PARALLEL SAFE
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

CREATE OR REPLACE FUNCTION calc_listing_price(final_price BIGINT, listing_price BIGINT, invert_delphi_pair BOOLEAN, delphi_median BIGINT, delphi_quote_precision INT, delphi_base_precision INT, delphi_median_precision INT) RETURNS BIGINT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
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
