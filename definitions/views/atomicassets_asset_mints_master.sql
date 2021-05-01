CREATE OR REPLACE VIEW atomicassets_asset_mints_master AS
    SELECT asset.contract, asset.asset_id,
       CASE template_id IS NULL WHEN TRUE THEN NULL ELSE row_number() over (partition by template_id order by asset_id) END template_mint
    FROM atomicassets_assets asset
