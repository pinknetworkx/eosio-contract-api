CREATE OR REPLACE VIEW atomicassets_templates_master AS
    SELECT DISTINCT ON (template_a.contract, template_a.template_id)
        template_a.contract, template_a.template_id, template_a.transferable is_transferable,
        template_a.burnable is_burnable, template_a.issued_supply, template_a.max_supply,
        template_a.readable_name "name",
        template_a.collection_name, collection_a.authorized_accounts,
        json_build_object(
            'collection_name', collection_a.collection_name,
            'name', collection_a.readable_name,
            'img', collection_a.data->'img',
            'author', collection_a.author,
            'allow_notify', collection_a.allow_notify,
            'authorized_accounts', collection_a.authorized_accounts,
            'notify_accounts', collection_a.notify_accounts,
            'market_fee', collection_a.market_fee,
            'created_at_block', collection_a.created_at_block,
            'created_at_time', collection_a.created_at_time
        ) collection,
        template_a.schema_name,
        json_build_object(
            'schema_name', schema_a.schema_name,
            'format', schema_a.format,
            'created_at_block', schema_a.created_at_block,
            'created_at_time', schema_a.created_at_time
        ) "schema",
        (SELECT json_object_agg("key", "value") FROM atomicassets_templates_data WHERE contract = template_a.contract AND template_id = template_a.template_id) AS immutable_data,
        template_a.created_at_time, template_a.created_at_block
    FROM
        atomicassets_templates template_a
        JOIN atomicassets_collections collection_a ON (collection_a.contract = template_a.contract AND collection_a.collection_name = template_a.collection_name)
        JOIN atomicassets_schemas schema_a ON (schema_a.contract = template_a.contract AND schema_a.schema_name = template_a.schema_name)
