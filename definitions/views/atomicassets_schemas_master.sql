CREATE OR REPLACE VIEW atomicassets_schemas_master AS
    SELECT DISTINCT ON (schema_a.contract, schema_a.schema_name)
        schema_a.contract, schema_a.schema_name, schema_a.format,
        collection_a.collection_name, collection_a.authorized_accounts,
        json_build_object(
            'collection_name', collection_a.collection_name,
            'name', collection_a.readable_name,
            'author', collection_a.author,
            'allow_notify', collection_a.allow_notify,
            'authorized_accounts', collection_a.authorized_accounts,
            'notify_accounts', collection_a.notify_accounts,
            'market_fee', collection_a.market_fee,
            'created_at_block', collection_a.created_at_block,
            'created_at_time', collection_a.created_at_time
        ) collection,
        schema_a.created_at_time, schema_a.created_at_block
    FROM
        atomicassets_schemas schema_a,
        atomicassets_collections collection_a
    WHERE
        collection_a.contract = schema_a.contract AND collection_a.collection_name = schema_a.collection_name
