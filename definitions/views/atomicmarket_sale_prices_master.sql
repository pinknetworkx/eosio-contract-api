CREATE OR REPLACE VIEW atomicmarket_sale_prices_master AS
    SELECT DISTINCT ON (market_contract, sale_id)
        sale.market_contract,
        sale.sale_id,

        sale.state,

        (CASE
            WHEN sale.final_price IS NOT NULL THEN sale.final_price
            WHEN pair.invert_delphi_pair IS NOT NULL AND pair.invert_delphi_pair = true THEN
                (sale.listing_price::decimal * delphi.median * power(10.0, delphi.quote_precision - delphi.base_precision - delphi.median_precision))::bigint
            WHEN pair.invert_delphi_pair IS NOT NULL AND pair.invert_delphi_pair = false THEN
                ((sale.listing_price::decimal / delphi.median) * power(10.0, delphi.median_precision + delphi.base_precision - delphi.quote_precision))::bigint
            ELSE sale.listing_price
        END) price,

        token.token_contract settlement_contract,
        token.token_precision settlement_precision,
        token.token_symbol settlement_symbol,

        delphi.median,
        delphi.median_precision,

        sale.listing_price,
        sale.listing_symbol,
        (CASE
            WHEN pair.invert_delphi_pair IS NOT NULL AND pair.invert_delphi_pair = true THEN delphi.base_precision
            WHEN pair.invert_delphi_pair IS NOT NULL AND pair.invert_delphi_pair = false THEN delphi.quote_precision
            ELSE NULL
        END) listing_precision
    FROM
        atomicmarket_sales sale LEFT JOIN atomicmarket_symbol_pairs pair ON (
            pair.market_contract = sale.market_contract AND
            pair.listing_symbol = sale.listing_symbol AND
            pair.settlement_symbol = sale.settlement_symbol
        ) LEFT JOIN delphioracle_pairs delphi ON (
            pair.delphi_contract = delphi.contract AND
            pair.delphi_pair_name = delphi.delphi_pair_name
        ),
        atomicmarket_tokens token
    WHERE
        sale.market_contract = token.market_contract AND sale.settlement_symbol = token.token_symbol
