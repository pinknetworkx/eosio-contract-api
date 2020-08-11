CREATE OR REPLACE VIEW atomicassets_offers_master AS
    SELECT DISTINCT ON (offer_a.contract, offer_a.offer_id)
        offer_a.contract, offer_a.offer_id,
        offer_a.sender sender_name, offer_a.recipient recipient_name, offer_a.memo,
        offer_a.state,

        ARRAY(
            SELECT asset_o.asset_id
            FROM atomicassets_offers_assets asset_o
            WHERE asset_o.offer_id = offer_a.offer_id AND asset_o.contract::text = offer_a.contract::text AND asset_o.owner::text = offer_a.sender::text
        ) sender_assets,

        ARRAY(
            SELECT asset_o.asset_id
            FROM atomicassets_offers_assets asset_o
            WHERE asset_o.offer_id = offer_a.offer_id AND asset_o.contract::text = offer_a.contract::text AND asset_o.owner::text = offer_a.recipient::text
        ) recipient_assets,

        EXISTS(SELECT * FROM contract_codes WHERE account = offer_a.sender) is_sender_contract,
        EXISTS(SELECT * FROM contract_codes WHERE account = offer_a.recipient) is_recipient_contract,

        offer_a.updated_at_block, offer_a.updated_at_time,
        offer_a.created_at_block, offer_a.created_at_time
    FROM
        atomicassets_offers offer_a
