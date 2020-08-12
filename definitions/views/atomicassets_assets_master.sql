CREATE OR REPLACE VIEW atomicassets_assets_master AS
    SELECT DISTINCT ON (asset.contract, asset.asset_id)
        asset.contract, asset.asset_id, asset.owner,

        CASE WHEN "template".template_id IS NULL THEN true ELSE "template".transferable END AS is_transferable,
        CASE WHEN "template".template_id IS NULL THEN true ELSE "template".burnable END AS is_burnable,

        asset.collection_name,
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

        asset.schema_name,
        json_build_object(
            'schema_name', "schema".schema_name,
            'format', "schema".format,
            'created_at_block', "schema".created_at_block,
            'created_at_time', "schema".created_at_time
        ) "schema",

        asset.template_id,
        CASE WHEN "template".template_id IS NULL THEN null ELSE
        json_build_object(
            'template_id', "template".template_id,
            'max_supply', "template".max_supply,
            'is_transferable', "template".transferable,
            'is_burnable', "template".burnable,
            'issued_supply', "template".issued_supply,
            'immutable_data', "template".immutable_data,
            'created_at_time', "template".created_at_time,
            'created_at_block', "template".created_at_block
        ) END AS "template",

        asset.mutable_data,
        asset.immutable_data,

        COALESCE(mint.template_mint, 0) template_mint,
        mint.schema_mint,
        mint.collection_mint,

        ARRAY(
            SELECT DISTINCT ON (inner_backed.contract, inner_backed.asset_id, inner_backed.token_symbol)
                json_build_object(
                    'token_contract', inner_symbol.token_contract,
                    'token_symbol', inner_symbol.token_symbol,
                    'token_precision', inner_symbol.token_precision,
                    'amount', inner_backed.amount
                )
            FROM atomicassets_assets_backed_tokens inner_backed, atomicassets_tokens inner_symbol
            WHERE
                inner_backed.contract = inner_symbol.contract AND inner_backed.token_symbol = inner_symbol.token_symbol AND
                inner_backed.contract = asset.contract AND inner_backed.asset_id = asset.asset_id
        ) backed_tokens,

        asset.burned_at_block, asset.burned_at_time, asset.updated_at_block,
        asset.updated_at_time, asset.minted_at_block, asset.minted_at_time
    FROM
        atomicassets_assets asset
        LEFT JOIN atomicassets_templates "template" ON (
            "template".contract = asset.contract AND "template".template_id = asset.template_id
        )
        LEFT JOIN atomicassets_asset_mints mint ON (
            mint.contract = asset.contract AND mint.asset_id = asset.asset_id
        )
        JOIN atomicassets_collections collection ON (collection.contract = asset.contract AND collection.collection_name = asset.collection_name)
        JOIN atomicassets_schemas "schema" ON ("schema".contract = asset.contract AND "schema".collection_name = asset.collection_name AND "schema".schema_name = asset.schema_name)
