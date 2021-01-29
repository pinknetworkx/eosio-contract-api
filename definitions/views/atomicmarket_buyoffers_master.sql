CREATE OR REPLACE VIEW atomicmarket_buyoffers_master AS
    SELECT DISTINCT ON (market_contract, buyoffer_id)
        buyoffer.market_contract,
        buyoffer.assets_contract,
        buyoffer.buyoffer_id,

        buyoffer.seller,
        buyoffer.buyer,

        buyoffer.price raw_price,
        token.token_precision raw_token_precision,
        token.token_symbol raw_token_symbol,

        json_build_object(
            'token_contract', token.token_contract,
            'token_symbol', token.token_symbol,
            'token_precision', token.token_precision,
            'amount', buyoffer.price::text
        ) price,

        ARRAY(
            SELECT asset.asset_id
            FROM atomicmarket_buyoffers_assets asset
            WHERE buyoffer.buyoffer_id = asset.buyoffer_id AND asset.market_contract = buyoffer.market_contract
        ) assets,

        buyoffer.maker_marketplace,
        buyoffer.taker_marketplace,

        buyoffer.collection_name,
        json_build_object(
            'collection_name', collection.collection_name,
            'name', collection.data->>'name',
            'img', collection.data->>'img',
            'author', collection.author,
            'allow_notify', collection.allow_notify,
            'authorized_accounts', collection.authorized_accounts,
            'notify_accounts', collection.notify_accounts,
            'market_fee', buyoffer.collection_fee,
            'created_at_block', collection.created_at_block::text,
            'created_at_time', collection.created_at_time::text
        ) collection,

        buyoffer.state buyoffer_state,

        buyoffer.memo, buyoffer.decline_memo,

        buyoffer.updated_at_block,
        buyoffer.updated_at_time,
        buyoffer.created_at_block,
        buyoffer.created_at_time
    FROM atomicmarket_buyoffers buyoffer, atomicassets_collections collection, atomicmarket_tokens token
    WHERE buyoffer.market_contract = token.market_contract AND buyoffer.token_symbol = token.token_symbol AND
        buyoffer.assets_contract = collection.contract AND buyoffer.collection_name = collection.collection_name
