CREATE OR REPLACE VIEW atomicassets_transfers_master AS
    SELECT
        transfer_a.contract, transfer_a.sender sender_name, transfer_a.recipient recipient_name, transfer_a.memo,
        encode(transfer_a.txid::bytea, 'hex') txid,
        ARRAY(
            SELECT DISTINCT ON (asset_a.contract, asset_a.asset_id) row_to_json(asset_a)
            FROM atomicassets_assets_master asset_a, atomicassets_transfers_assets asset_o
            WHERE
                asset_o.contract = asset_a.contract AND asset_o.asset_id = asset_a.asset_id AND
                asset_o.transfer_id = transfer_a.transfer_id AND asset_o.contract = transfer_a.contract
        ) assets,
        transfer_a.created_at_block, transfer_a.created_at_time
    FROM atomicassets_transfers transfer_a
