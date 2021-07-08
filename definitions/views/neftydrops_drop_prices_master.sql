CREATE
OR REPLACE VIEW neftydrops_drop_prices_master AS
SELECT DISTINCT
ON (drops_contract, drop_id)
    ndrop.drops_contract,
    ndrop.drop_id,

    ndrop.state,

    (CASE
    WHEN pair.invert_delphi_pair IS NOT NULL AND pair.invert_delphi_pair = true THEN
    LEAST(ndrop.listing_price:: decimal * delphi.median * power(10.0, delphi.quote_precision - delphi.base_precision - delphi.median_precision), 9223372036854775807)::bigint
    WHEN pair.invert_delphi_pair IS NOT NULL AND pair.invert_delphi_pair = false THEN
    LEAST((ndrop.listing_price:: decimal / delphi.median) * power(10.0, delphi.median_precision + delphi.base_precision - delphi.quote_precision), 9223372036854775807)::bigint
    ELSE ndrop.listing_price
    END) price,

    (CASE
    WHEN ndrop.settlement_symbol = 'NULL' THEN '':: VARCHAR(12)
    ELSE token.token_contract
    END) settlement_contract,

    (CASE
    WHEN ndrop.settlement_symbol = 'NULL' THEN 0
    ELSE token.token_precision
    END) settlement_precision,

    (CASE
    WHEN ndrop.settlement_symbol = 'NULL' THEN 'NULL':: VARCHAR(12)
    ELSE token.token_symbol
    END) settlement_symbol,

    delphi.median,
    delphi.median_precision,

    ndrop.listing_price,
    ndrop.listing_symbol,
    (CASE
    WHEN pair.invert_delphi_pair IS NOT NULL AND pair.invert_delphi_pair = true THEN delphi.base_precision
    WHEN pair.invert_delphi_pair IS NOT NULL AND pair.invert_delphi_pair = false THEN delphi.quote_precision
    ELSE NULL
    END) listing_precision
FROM
    neftydrops_drops ndrop LEFT JOIN neftydrops_symbol_pairs pair
ON (
    pair.drops_contract = ndrop.drops_contract AND
    pair.listing_symbol = ndrop.listing_symbol AND
    pair.settlement_symbol = ndrop.settlement_symbol
    ) LEFT JOIN delphioracle_pairs delphi ON (
    pair.delphi_contract = delphi.contract AND
    pair.delphi_pair_name = delphi.delphi_pair_name
    ),
    neftydrops_tokens token
WHERE
    ndrop.drops_contract = token.drops_contract
  AND (ndrop.settlement_symbol = token.token_symbol
   OR ndrop.settlement_symbol = 'NULL')
