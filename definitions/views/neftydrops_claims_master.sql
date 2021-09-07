CREATE
OR REPLACE VIEW neftydrops_claims_master AS
SELECT DISTINCT
ON (drops_contract, claim_id)
    claim.drops_contract,
    claim.assets_contract,
    claim.claim_id,
    claim.claimer,
    claim.amount,

    json_build_object(
    'amount', claim.total_price,
    'token_contract', (CASE
    WHEN claim.settlement_symbol = 'NULL' THEN '':: VARCHAR (12)
    ELSE token.token_contract
    END),
    'token_symbol', (CASE
    WHEN claim.settlement_symbol = 'NULL' THEN 'NULL':: VARCHAR (12)
    ELSE token.token_symbol
    END),
    'token_precision', (CASE
    WHEN claim.settlement_symbol = 'NULL' THEN 0
    ELSE token.token_precision
    END)
    ) total_price,

    claim.referrer,
    claim.txid,
    claim.created_at_block,
    claim.created_at_time
FROM
    neftydrops_claims claim LEFT JOIN neftydrops_tokens token
ON (
    claim.settlement_symbol = token.token_symbol OR claim.settlement_symbol = 'NULL'
    )
WHERE
    claim.drops_contract = token.drops_contract
