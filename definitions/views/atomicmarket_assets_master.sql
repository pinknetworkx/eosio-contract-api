CREATE OR REPLACE VIEW atomicmarket_assets_master AS
    SELECT
        asset.*,
        ARRAY(
            SELECT
                json_build_object(
                    'market_contract', sale.market_contract,
                    'sale_id', sale.sale_id
                )
            FROM atomicmarket_sales sale, atomicassets_offers offer, atomicassets_offers_assets offer_asset
            WHERE sale.assets_contract = offer.contract AND sale.offer_id = offer.offer_id AND
                offer.contract = offer_asset.contract AND offer.offer_id = offer_asset.offer_id AND
                offer_asset.contract = asset.contract AND offer_asset.asset_id = asset.asset_id AND
                offer.state = 0 AND sale.state = 1
        ) sales,
        ARRAY(
            SELECT
                json_build_object(
                    'market_contract', auction.market_contract,
                    'auction_id', auction.auction_id
                )
            FROM atomicmarket_auctions auction, atomicmarket_auctions_assets auction_asset
            WHERE auction.market_contract = auction_asset.market_contract AND auction.auction_id = auction_asset.auction_id AND
                auction_asset.assets_contract = asset.contract AND auction_asset.asset_id = asset.asset_id AND
                auction.state = 1 AND auction.end_time > (extract(epoch from now()) * 1000)::bigint
        ) auctions,
        ARRAY(
            SELECT
            		(SELECT json_build_object(
            			'market_contract', t_buyoffer2.market_contract,
            			'buyoffer_id', t_buyoffer2.buyoffer_id,
            			'token_symbol', t_buyoffer2.token_symbol
            		) FROM atomicmarket_template_buyoffers t_buyoffer2 WHERE t_buyoffer2.template_id = t_buyoffer.template_id AND t_buyoffer2.token_symbol = t_buyoffer.token_symbol AND t_buyoffer2.price = MAX(t_buyoffer.price) AND state = 0)
            	FROM atomicmarket_template_buyoffers t_buyoffer
            	WHERE t_buyoffer.assets_contract = asset.contract AND t_buyoffer.template_id = asset.template_id AND
            		t_buyoffer.state = 0
            	GROUP BY template_id, token_symbol
        ) template_buyoffers
    FROM atomicassets_assets_master asset
