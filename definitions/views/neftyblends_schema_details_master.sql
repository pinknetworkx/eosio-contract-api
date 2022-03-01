CREATE OR REPLACE VIEW neftyblends_schema_details_master AS
SELECT
	"schema".collection_name as collection_name,
	"schema".schema_name as schema_name,
	jsonb_build_object(
		'collection_name', collection.collection_name,
		'format', "schema".format, 
		'schema_name', "schema".schema_name, 
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
		'created_at_time', "schema".created_at_time, 
		'created_at_block', "schema".created_at_block) as schema_json_object
FROM atomicassets_schemas "schema"
	JOIN 
		atomicassets_collections collection ON
			"schema".collection_name = collection.collection_name;