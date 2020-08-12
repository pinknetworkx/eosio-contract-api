CREATE OR REPLACE VIEW atomicassets_templates_master AS
    SELECT DISTINCT ON ("template".contract, "template".template_id)
        "template".contract, "template".template_id, "template".transferable is_transferable,
        "template".burnable is_burnable, "template".issued_supply, "template".max_supply,

        "template".collection_name, collection.authorized_accounts,
        json_build_object(
            'collection_name', collection.collection_name,
            'name', collection.data->>'name',
            'img', collection.data->>'img',
            'author', collection.author,
            'allow_notify', collection.allow_notify,
            'authorized_accounts', collection.authorized_accounts,
            'notify_accounts', collection.notify_accounts,
            'market_fee', collection.market_fee,
            'created_at_block', collection.created_at_block,
            'created_at_time', collection.created_at_time
        ) collection,
        "template".schema_name,
        json_build_object(
            'schema_name', "schema".schema_name,
            'format', "schema".format,
            'created_at_block', "schema".created_at_block,
            'created_at_time', "schema".created_at_time
        ) "schema",
        "template".immutable_data,
        "template".created_at_time, "template".created_at_block
    FROM
        atomicassets_templates "template"
        JOIN atomicassets_collections collection ON (collection.contract = "template".contract AND collection.collection_name = "template".collection_name)
        JOIN atomicassets_schemas "schema" ON ("schema".contract = "template".contract AND "schema".schema_name = "template".schema_name)
