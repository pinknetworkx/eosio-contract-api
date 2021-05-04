CREATE OR REPLACE PROCEDURE update_atomicmarket_buyoffer_mints(selected_contract TEXT, last_irreversible_block BIGINT, max_buyoffers_to_update INT = 50000)
LANGUAGE plpgsql
AS $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        WITH buyoffers_to_update AS MATERIALIZED (
            SELECT market_contract, buyoffer_id
            FROM atomicmarket_buyoffers
            WHERE template_mint IS NULL
                AND market_contract = selected_contract
                AND created_at_block <= last_irreversible_block
            LIMIT max_buyoffers_to_update
        ), new_mints AS MATERIALIZED (
            SELECT
                buyoffer.market_contract,
                buyoffer.buyoffer_id,
                MIN(template_mint) min_template_mint,
                MAX(template_mint) max_template_mint
            FROM buyoffers_to_update buyoffer
                JOIN atomicmarket_buyoffers_assets asset ON (buyoffer.market_contract = asset.market_contract AND buyoffer.buyoffer_id = asset.buyoffer_id)
                JOIN atomicassets_assets assets ON asset.asset_id = assets.asset_id AND asset.assets_contract = assets.contract
            GROUP BY buyoffer.market_contract, buyoffer.buyoffer_id
            -- filter out buyoffers where assets have a template id, but the mint is not yet set
            HAVING NOT BOOL_OR(assets.template_id IS NOT NULL AND assets.template_mint IS NULL)
        )
        SELECT *
        FROM new_mints
    LOOP
        UPDATE atomicmarket_buyoffers buyoffer
            SET template_mint =
                    CASE WHEN r.min_template_mint IS NULL
                        THEN 'empty'
                        ELSE int4range(r.min_template_mint, r.max_template_mint, '[]')
                    END
        WHERE buyoffer.market_contract = r.market_contract
            AND buyoffer.buyoffer_id = r.buyoffer_id
        ;

        COMMIT;
    END LOOP;
END
$$
;
