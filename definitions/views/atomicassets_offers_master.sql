CREATE OR REPLACE VIEW atomicassets_offers_master AS
    SELECT DISTINCT ON (offer_a.contract, offer_a.offer_id)
        offer_a.contract, offer_a.offer_id,
        offer_a.sender sender_name, offer_a.recipient recipient_name, offer_a.memo,
        offer_a.state,

        code_recipient.account recipient_contract_account,
        CASE WHEN code_sender.account IS NULL THEN false ELSE true END AS is_sender_contract,
        CASE WHEN code_recipient.account IS NULL THEN false ELSE true END AS is_recipient_contract,

        ARRAY(
            SELECT asset_o.asset_id
            FROM atomicassets_offers_assets asset_o
            WHERE asset_o.offer_id = offer_a.offer_id AND asset_o.contract = offer_a.contract AND asset_o.owner = offer_a.sender
        ) sender_assets,
        ARRAY(
            SELECT asset_o.asset_id
            FROM atomicassets_offers_assets asset_o
            WHERE asset_o.offer_id = offer_a.offer_id AND asset_o.contract = offer_a.contract AND asset_o.owner = offer_a.recipient
        ) recipient_assets,

        offer_a.updated_at_block, offer_a.updated_at_time,
        offer_a.created_at_block, offer_a.created_at_time
    FROM
        atomicassets_offers offer_a
        LEFT JOIN contract_codes code_sender ON (code_sender.account = offer_a.sender)
        LEFT JOIN contract_codes code_recipient ON (code_recipient.account = offer_a.recipient)
