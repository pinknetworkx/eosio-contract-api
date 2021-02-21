CREATE OR REPLACE VIEW atomicassets_offers_master AS
    SELECT DISTINCT ON (offer.contract, offer.offer_id)
        offer.contract, offer.offer_id,
        offer.sender sender_name, offer.recipient recipient_name, offer.memo,
        offer.state,

        ARRAY(
            SELECT offer_asset.asset_id
            FROM atomicassets_offers_assets offer_asset
            WHERE offer_asset.offer_id = offer.offer_id AND offer_asset.contract = offer.contract AND offer_asset.owner = offer.sender
            ORDER BY "index" ASC
        ) sender_assets,

        ARRAY(
            SELECT offer_asset.asset_id
            FROM atomicassets_offers_assets offer_asset
            WHERE offer_asset.offer_id = offer.offer_id AND offer_asset.contract = offer.contract AND offer_asset.owner = offer.recipient
            ORDER BY "index" ASC
        ) recipient_assets,

        EXISTS(SELECT * FROM contract_codes WHERE account = offer.sender) is_sender_contract,
        EXISTS(SELECT * FROM contract_codes WHERE account = offer.recipient) is_recipient_contract,

        offer.updated_at_block, offer.updated_at_time,
        offer.created_at_block, offer.created_at_time
    FROM
        atomicassets_offers offer
