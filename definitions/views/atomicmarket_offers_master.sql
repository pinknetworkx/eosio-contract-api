CREATE OR REPLACE VIEW atomicmarket_offers_master AS
    SELECT
        offer_a.*,

        ARRAY (
            SELECT list.market_contract
            FROM atomicmarket_blacklist_accounts list
            WHERE list.account = offer_a.sender_name
        ) sender_blacklisted_markets,
        ARRAY (
            SELECT list.market_contract
            FROM atomicmarket_blacklist_accounts list
            WHERE list.account = offer_a.recipient_name
        ) recipient_blacklisted_markets
    FROM atomicassets_offers_master offer_a
