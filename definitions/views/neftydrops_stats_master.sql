CREATE
OR REPLACE VIEW neftydrops_stats_master AS
SELECT claim.drops_contract,
       'drop'                listing_type,
       claim.claim_id        listing_id,
       claim.claimer         buyer,
       claim.collection_name seller,
       'NB'                  marker_marketplace,
       'NB'                  taker_marketplace,
       claim.assets_contract assets_contract,
       claim.collection_name collection_name,
       CASE
           WHEN claim.settlement_symbol = 'NULL' THEN 'WAX':: VARCHAR(12)
           WHEN claim.core_symbol IS NOT NULL THEN claim.core_symbol
           ELSE claim.settlement_symbol
           END               symbol,
        CASE
           WHEN claim.core_symbol IS NOT NULL THEN claim.core_amount
           ELSE claim.total_price
           END               price,
       claim.created_at_time "time"
FROM neftydrops_claims claim
WHERE claim.final_price IS NOT NULL
