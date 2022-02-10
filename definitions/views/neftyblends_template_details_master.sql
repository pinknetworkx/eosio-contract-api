CREATE OR REPLACE VIEW neftyblends_template_details_master AS
SELECT
	"template".template_id as template_id,
	collection.collection_name,
	jsonb_build_object(
		'contract', "template".contract,
		'template_id', "template".template_id,
		'transferable is_transferable', "template".transferable,
		'burnable is_burnable', "template".burnable,
		'issued_supply', "template".issued_supply,
		'max_supply', "template".max_supply,
		'collection_name', "template".collection_name,
		'authorized_accounts', collection.authorized_accounts,
		'collection', jsonb_build_object(
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
		),
		'schema_name', "template".schema_name,
		'schema', jsonb_build_object(
			'schema_name', "schema".schema_name,
			'format', "schema".format,
			'created_at_block', "schema".created_at_block::text,
			'created_at_time', "schema".created_at_time::text
		),
		'immutable_data', "template".immutable_data,
		'created_at_time', "template".created_at_time,
		'created_at_block', "template".created_at_block
	) as template_json_object
FROM
	atomicassets_templates "template" 
	JOIN 
		atomicassets_collections collection ON
			"template".collection_name = collection.collection_name
	JOIN 
		atomicassets_schemas "schema" ON
			"template".collection_name = "schema".collection_name AND
			"template".schema_name = "schema".schema_name;