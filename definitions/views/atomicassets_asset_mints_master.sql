CREATE OR REPLACE VIEW atomicassets_asset_mints_master AS
    SELECT asset.contract, asset.asset_id,
       row_number() OVER (PARTITION BY collection_name ORDER BY asset_id ASC) collection_mint,
       row_number() OVER (PARTITION BY schema_name ORDER BY asset_id ASC) schema_mint,
       CASE template_id IS NULL WHEN TRUE THEN 0 ELSE row_number() over (partition by template_id order by asset_id) END template_mint
    FROM atomicassets_assets asset
