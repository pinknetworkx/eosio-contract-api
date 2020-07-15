CREATE OR REPLACE VIEW atomicassets_collections_master AS
    SELECT
        collection_a.contract, collection_a.collection_name,
        collection_a.readable_name "name",
        collection_a.data->'img' img,
        collection_a.author, collection_a.allow_notify,
        collection_a.authorized_accounts, collection_a.notify_accounts,
        collection_a.market_fee, collection_a.data,
        collection_a.created_at_time, collection_a.created_at_block
    FROM atomicassets_collections collection_a
