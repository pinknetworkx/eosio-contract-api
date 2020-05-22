CREATE OR REPLACE VIEW atomicassets_offers_master AS
    SELECT DISTINCT ON (offer_a.contract, offer_a.offer_id)
        offer_a.contract, offer_a.offer_id,
        offer_a.sender sender_name, offer_a.recipient recipient_name, offer_a.memo,
        offer_a.state,
        offer_a.updated_at_block, offer_a.updated_at_time,
        offer_a.created_at_block, offer_a.created_at_time,
        CASE WHEN code_sender.account IS NULL THEN false ELSE true END AS is_sender_contract,
        CASE WHEN code_recipient.account IS NULL THEN false ELSE true END AS is_recipient_contract,
        ARRAY(
            SELECT DISTINCT ON (asset_a.contract, asset_a.asset_id) row_to_json(asset_a)
            FROM atomicassets_assets_master asset_a, atomicassets_offers_assets asset_o
            WHERE
                asset_o.contract = asset_a.contract AND asset_o.asset_id = asset_a.asset_id AND
                asset_o.owner = offer_a.sender AND asset_o.offer_id = offer_a.offer_id AND asset_o.contract = offer_a.contract
        ) sender_assets,
        ARRAY(
            SELECT DISTINCT ON (asset_a.contract, asset_a.asset_id) row_to_json(asset_a)
            FROM atomicassets_assets_master asset_a, atomicassets_offers_assets asset_o
            WHERE
                asset_o.contract = asset_a.contract AND asset_o.asset_id = asset_a.asset_id AND
                asset_o.owner = offer_a.recipient AND asset_o.offer_id = offer_a.offer_id AND asset_o.contract = offer_a.contract
        ) recipient_assets
    FROM
        atomicassets_offers offer_a
        LEFT JOIN contract_codes code_sender ON (code_sender.account = offer_a.sender)
        LEFT JOIN contract_codes code_recipient ON (code_recipient.account = offer_a.recipient)
