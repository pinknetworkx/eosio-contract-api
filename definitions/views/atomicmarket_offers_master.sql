CREATE OR REPLACE VIEW atomicmarket_offers_master AS
    SELECT
        offer_a.*
    FROM atomicassets_offers_master offer_a
