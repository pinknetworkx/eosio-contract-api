CREATE OR REPLACE PROCEDURE update_atomicmarket_sale_mints(selected_contract TEXT, last_irreversible_block BIGINT, max_sales_to_update INT = 50000)
LANGUAGE plpgsql
AS $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        WITH sales_to_update AS MATERIALIZED (
            SELECT assets_contract, sale_id, offer_id
            FROM atomicmarket_sales
            WHERE template_mint IS NULL
                AND assets_contract = selected_contract
                AND created_at_block <= last_irreversible_block
            LIMIT max_sales_to_update
        ), new_mints AS MATERIALIZED (
            SELECT
                listing.assets_contract,
                listing.sale_id,
                MIN(template_mint) min_template_mint,
                MAX(template_mint) max_template_mint
            FROM sales_to_update listing
                JOIN atomicassets_offers_assets asset ON (listing.assets_contract = asset.contract AND listing.offer_id = asset.offer_id)
                JOIN atomicassets_assets assets ON asset.asset_id = assets.asset_id AND asset.contract = assets.contract
            GROUP BY listing.assets_contract, listing.sale_id
            -- filter out sales where assets have a template id, but the mint is not yet set
            HAVING NOT BOOL_OR(assets.template_id IS NOT NULL AND assets.template_mint IS NULL)
        )
        SELECT *
        FROM new_mints
    LOOP
        UPDATE atomicmarket_sales listing
            SET template_mint =
                    CASE WHEN r.min_template_mint IS NULL
                        THEN 'empty'
                        ELSE int4range(r.min_template_mint, r.max_template_mint, '[]')
                    END
        WHERE listing.assets_contract = r.assets_contract
            AND listing.sale_id = r.sale_id
        ;

        COMMIT;
    END LOOP;
END
$$
;
