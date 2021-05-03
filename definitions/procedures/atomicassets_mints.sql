CREATE OR REPLACE PROCEDURE set_asset_mints()
LANGUAGE plpgsql
AS $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        WITH assets_to_update AS MATERIALIZED (
            SELECT contract, asset_id, template_id
            FROM atomicassets_assets
            WHERE template_id IS NOT NULL AND template_mint IS NULL
            ORDER BY template_id, asset_id
            LIMIT 50000
        ), templates AS (
            SELECT DISTINCT template_id, contract
            FROM assets_to_update
        ), last_mint AS (
            SELECT t.template_id, t.contract, (SELECT a.template_mint FROM atomicassets_assets a WHERE a.template_id = t.template_id AND a.contract = t.contract AND a.template_mint IS NOT NULL ORDER BY asset_id DESC LIMIT 1)
            FROM templates t
        ), new_mints AS (
            SELECT assets.contract, assets.asset_id, COALESCE(last_mint.template_mint, 0) + ROW_NUMBER() OVER (PARTITION BY assets.template_id, assets.contract ORDER BY asset_id) AS template_mint
            FROM assets_to_update assets
                LEFT OUTER JOIN last_mint ON (assets.template_id = last_mint.template_id AND assets.contract = last_mint.contract)
        )
        SELECT *
        FROM new_mints
        ORDER BY contract, asset_id
    LOOP
        UPDATE atomicassets_assets
            SET template_mint = r.template_mint
        WHERE asset_id = r.asset_id
            AND contract = r.contract
        ;

        COMMIT;
    END LOOP;
END
$$
;
