CREATE OR REPLACE VIEW atomicassets_transfers_master AS
    SELECT
        transfer_a.transfer_id, transfer_a.contract,
        transfer_a.sender sender_name, transfer_a.recipient recipient_name, transfer_a.memo,
        encode(transfer_a.txid::bytea, 'hex') txid,
        ARRAY(
            SELECT asset_t.asset_id
            FROM atomicassets_transfers_assets asset_t
            WHERE asset_t.transfer_id = transfer_a.transfer_id AND asset_t.contract = transfer_a.contract
        ) assets,
        transfer_a.created_at_block, transfer_a.created_at_time
    FROM atomicassets_transfers transfer_a
