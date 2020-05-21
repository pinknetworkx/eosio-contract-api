CREATE OR REPLACE VIEW atomicassets_transfers_master AS
    SELECT
        transfer_a.contract, transfer_a.sender sender_name, transfer_a.recipient recipient_name, transfer_a.memo,
        encode(transfer_a.txid::bytea, 'hex') txid,
        ARRAY(
            SELECT row_to_json(asset_a)
            FROM atomicassets_assets_master asset_a
            WHERE transfer_a.contract = asset_a.contract AND asset_a.asset_id IN (
                SELECT asset_id FROM atomicassets_transfers_assets asset_t WHERE asset_t.contract = transfer_a.contract AND asset_t.transfer_id = transfer_a.transfer_id
            )
        ) assets,
        transfer_a.created_at_block, transfer_a.created_at_time
    FROM atomicassets_transfers transfer_a
