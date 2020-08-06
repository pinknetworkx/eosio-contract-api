CREATE OR REPLACE VIEW atomictools_links_master AS
    SELECT
        link.tools_contract, link.link_id, link.assets_contract,
        link.creator, link.claimer, link.state, link.memo,
        encode(link.txid::bytea, 'hex') txid,
        link.key_type, link.key_data,
        ARRAY(
            SELECT asset_id
            FROM atomictools_links_assets asset
            WHERE asset.link_id = link.link_id AND asset.tools_contract = link.tools_contract
        ) assets,
        link.created_at_block, link.created_at_time,
        link.updated_at_block, link.updated_at_time
    FROM atomictools_links link
