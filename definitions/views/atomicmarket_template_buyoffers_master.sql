CREATE OR REPLACE VIEW atomicmarket_template_buyoffers_master AS
    SELECT DISTINCT ON (market_contract, buyoffer_id)
        t_buyoffer.market_contract,
        t_buyoffer.assets_contract,
        t_buyoffer.buyoffer_id,

        t_buyoffer.seller,
        t_buyoffer.buyer,

        t_buyoffer.price raw_price,
        token.token_precision raw_token_precision,
        token.token_symbol raw_token_symbol,

        json_build_object(
            'token_contract', token.token_contract,
            'token_symbol', token.token_symbol,
            'token_precision', token.token_precision,
            'amount', t_buyoffer.price::text
        ) price,

        ARRAY(
            SELECT asset.asset_id
            FROM atomicmarket_template_buyoffers_assets asset
            WHERE t_buyoffer.buyoffer_id = asset.buyoffer_id AND asset.market_contract = t_buyoffer.market_contract
            ORDER BY "index" ASC
        ) assets,

        t_buyoffer.maker_marketplace,
        t_buyoffer.taker_marketplace,

        t_buyoffer.collection_name,
        json_build_object(
            'collection_name', collection.collection_name,
            'name', collection.data->>'name',
            'img', collection.data->>'img',
            'images', collection.data->>'images',
            'author', collection.author,
            'allow_notify', collection.allow_notify,
            'authorized_accounts', collection.authorized_accounts,
            'notify_accounts', collection.notify_accounts,
            'market_fee', t_buyoffer.collection_fee,
            'created_at_block', collection.created_at_block::text,
            'created_at_time', collection.created_at_time::text
        ) collection,

        t_buyoffer.template_id,
        json_build_object(
            'template_id', "template".template_id::text,
            'max_supply', "template".max_supply::text,
            'is_transferable', "template".transferable,
            'is_burnable', "template".burnable,
            'issued_supply', "template".issued_supply::text,
            'immutable_data', "template".immutable_data,
            'created_at_time', "template".created_at_time::text,
            'created_at_block', "template".created_at_block::text
        ) "template",

        t_buyoffer.state buyoffer_state,

        t_buyoffer.updated_at_block,
        t_buyoffer.updated_at_time,
        t_buyoffer.created_at_block,
        t_buyoffer.created_at_time
    FROM atomicmarket_template_buyoffers t_buyoffer, atomicassets_collections collection, atomicassets_templates "template", atomicmarket_tokens token
    WHERE t_buyoffer.market_contract = token.market_contract AND t_buyoffer.token_symbol = token.token_symbol AND
        t_buyoffer.assets_contract = collection.contract AND t_buyoffer.collection_name = collection.collection_name AND
        t_buyoffer.assets_contract = "template".contract AND t_buyoffer.template_id = "template".template_id
