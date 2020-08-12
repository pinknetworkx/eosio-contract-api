CREATE OR REPLACE VIEW atomicassets_collections_master AS
    SELECT
        collection.contract, collection.collection_name,
        collection.data->>'name' "name",
        collection.data->>'img' img,
        collection.author, collection.allow_notify,
        collection.authorized_accounts, collection.notify_accounts,
        collection.market_fee, collection.data,
        collection.created_at_time, collection.created_at_block
    FROM atomicassets_collections collection
