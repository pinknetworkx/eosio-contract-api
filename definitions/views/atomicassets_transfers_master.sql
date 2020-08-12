CREATE OR REPLACE VIEW atomicassets_transfers_master AS
    SELECT
        transfer.transfer_id, transfer.contract,
        transfer.sender sender_name, transfer.recipient recipient_name, transfer.memo,
        encode(transfer.txid::bytea, 'hex') txid,
        ARRAY(
            SELECT asset_t.asset_id
            FROM atomicassets_transfers_assets asset_t
            WHERE asset_t.transfer_id = transfer.transfer_id AND asset_t.contract = transfer.contract
        ) assets,
        transfer.created_at_block, transfer.created_at_time
    FROM atomicassets_transfers transfer
