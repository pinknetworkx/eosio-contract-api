CREATE OR REPLACE VIEW neftymarket_stats_prices_master AS
	SELECT
		market_contract,
		listing_type,
		listing_id,
		assets_contract,
		collection_name,
		schema_name,
		template_id,
		asset_id,
		symbol,
		price,
		"time"
	FROM neftymarket_stats_markets
	WHERE asset_id IS NOT NULL
