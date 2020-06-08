CREATE OR REPLACE VIEW atomicmarket_sales_master AS
    SELECT DISTINCT ON (market_contract, sale_id)
        sale.market_contract,
        sale.sale_id,
        sale.seller,
        sale.asset_contract,
        sale.offer_id,

        sale.price raw_price,
        sale.token_symbol raw_symbol,
        sale.delphi_pair_name raw_delphi,
        json_build_object(
            'token_contract', symbol.token_contract,
            'token_symbol', symbol.token_symbol,
            'token_precision', symbol.token_precision,
            'amount', sale.price,
            'delphi', CASE WHEN sale.delphi_pair_name IS NULL THEN null ELSE json_build_object(
                'pair_name', sale.delphi_pair_name,
                'stable_symbol', delphi.stable_symbol,
                'token_symbol', delphi.token_symbol,
                'exchange_rate', delphi.exchange_rate
            ) END
        ) price,

        ARRAY(
            SELECT asset.asset_id
            FROM atomicassets_offers_assets asset
            WHERE sale.asset_contract = asset.contract AND asset.offer_id = sale.offer_id
        ) assets,

        sale.maker_marketplace,
        sale.taker_marketplace,
        sale.collection_fee,

        sale.state sale_state,
        offer.state offer_state,

        sale.updated_at_block,
        sale.updated_at_time,
        sale.created_at_block,
        sale.created_at_time
    FROM
        atomicmarket_sales sale LEFT JOIN atomicmarket_delphi_pairs delphi ON (sale.market_contract = delphi.market_contract AND sale.delphi_pair_name = delphi.delphi_pair_name),
        atomicassets_offers offer, atomicmarket_token_symbols symbol
    WHERE sale.asset_contract = offer.contract AND sale.offer_id = offer.offer_id AND
        sale.market_contract = symbol.market_contract AND sale.token_symbol = symbol.token_symbol
