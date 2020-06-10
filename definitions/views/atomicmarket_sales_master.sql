CREATE OR REPLACE VIEW atomicmarket_sales_master AS
    SELECT DISTINCT ON (market_contract, sale_id)
        sale.market_contract,
        sale.sale_id,
        sale.seller,
        sale.asset_contract,
        sale.offer_id,

        sale.price raw_price,

        ARRAY(
            SELECT asset.asset_id
            FROM atomicassets_offers_assets asset
            WHERE sale.asset_contract = asset.contract AND asset.offer_id = sale.offer_id
        ) assets,

        sale.maker_marketplace,
        sale.taker_marketplace,
        
        json_build_object(
            'collection_name', collection.collection_name,
            'name', collection.readable_name,
            'author', collection.author,
            'allow_notify', collection.allow_notify,
            'authorized_accounts', collection.authorized_accounts,
            'notify_accounts', collection.notify_accounts,
            'market_fee', sale.collection_fee,
            'created_at_block', collection.created_at_block,
            'created_at_time', collection.created_at_time
        ) collection,

        sale.state sale_state,
        offer.state offer_state,

        sale.updated_at_block,
        sale.updated_at_time,
        sale.created_at_block,
        sale.created_at_time
    FROM
        atomicmarket_sales sale, atomicassets_offers offer, atomicassets_collections collection
    WHERE
        sale.asset_contract = offer.contract AND sale.offer_id = offer.offer_id AND
        collection.contract = sale.asset_contract AND collection.collection_name = sale.collection_name
