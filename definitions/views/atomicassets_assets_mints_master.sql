CREATE OR REPLACE VIEW atomicassets_assets_mints_master AS
    SELECT
        asset.contract, asset.asset_id,
        (
            SELECT COUNT(*) FROM atomicassets_assets inner_asset
            WHERE asset.contract = inner_asset.contract AND inner_asset.template_id = asset.template_id AND
                inner_asset.template_id IS NOT NULL AND inner_asset.asset_id <= asset.asset_id
        ) template_mint
    FROM atomicassets_assets asset
