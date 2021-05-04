CREATE OR REPLACE PROCEDURE update_atomicmarket_auction_mints(selected_contract TEXT, last_irreversible_block BIGINT, max_auctions_to_update INT = 50000)
LANGUAGE plpgsql
AS $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        WITH auctions_to_update AS MATERIALIZED (
            SELECT market_contract, auction_id
            FROM atomicmarket_auctions
            WHERE template_mint IS NULL
                AND market_contract = selected_contract
                AND created_at_block <= last_irreversible_block
            LIMIT max_auctions_to_update
        ), new_mints AS MATERIALIZED (
            SELECT
                auction.market_contract,
                auction.auction_id,
                MIN(template_mint) min_template_mint,
                MAX(template_mint) max_template_mint
            FROM auctions_to_update auction
                JOIN atomicmarket_auctions_assets asset ON (auction.market_contract = asset.market_contract AND auction.auction_id = asset.auction_id)
                JOIN atomicassets_assets assets ON asset.asset_id = assets.asset_id AND asset.assets_contract = assets.contract
            GROUP BY auction.market_contract, auction.auction_id
            -- filter out auctions where assets have a template id, but the mint is not yet set
            HAVING NOT BOOL_OR(assets.template_id IS NOT NULL AND assets.template_mint IS NULL)
        )
        SELECT *
        FROM new_mints
    LOOP
        UPDATE atomicmarket_auctions auction
            SET template_mint =
                    CASE WHEN r.min_template_mint IS NULL
                        THEN 'empty'
                        ELSE int4range(r.min_template_mint, r.max_template_mint, '[]')
                    END
        WHERE auction.market_contract = r.market_contract
            AND auction.auction_id = r.auction_id
        ;

        COMMIT;
    END LOOP;
END
$$
;
