CREATE OR REPLACE VIEW atomicassets_schemas_master AS
    SELECT DISTINCT ON ("schema".contract, "schema".collection_name, "schema".schema_name)
        "schema".contract, "schema".schema_name, "schema".format,
        "schema".collection_name, collection.authorized_accounts,
        json_build_object(
            'collection_name', collection.collection_name,
            'name', collection.data->>'name',
            'img', collection.data->>'img',
            'author', collection.author,
            'allow_notify', collection.allow_notify,
            'authorized_accounts', collection.authorized_accounts,
            'notify_accounts', collection.notify_accounts,
            'market_fee', collection.market_fee,
            'created_at_block', collection.created_at_block::text,
            'created_at_time', collection.created_at_time::text
        ) collection,
        "schema".created_at_time, "schema".created_at_block
    FROM
        atomicassets_schemas "schema"
        JOIN atomicassets_collections collection ON (collection.contract = "schema".contract AND collection.collection_name = "schema".collection_name)
