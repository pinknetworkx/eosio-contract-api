CREATE OR REPLACE VIEW atomicmarket_auctions_master AS
    SELECT DISTINCT ON (market_contract, auction_id)
        auction.market_contract,
        auction.assets_contract,
        auction.auction_id,

        auction.seller,
        auction.buyer,

        auction.price raw_price,
        token.token_precision raw_token_precision,
        token.token_symbol raw_token_symbol,

        json_build_object(
            'token_contract', token.token_contract,
            'token_symbol', token.token_symbol,
            'token_precision', token.token_precision,
            'amount', auction.price
        ) price,

        ARRAY(
            SELECT asset.asset_id
            FROM atomicmarket_auctions_assets asset
            WHERE auction.auction_id = asset.auction_id AND asset.market_contract = auction.market_contract
        ) assets,

        ARRAY(
            SELECT
                json_build_object(
                    'number', bid.bid_number,
                    'account', bid.account,
                    'amount', bid.amount,
                    'created_at_block', bid.created_at_block,
                    'created_at_time', bid.created_at_time,
                    'txid', encode(bid.txid::bytea, 'hex')
                )
            FROM atomicmarket_auctions_bids bid
            WHERE bid.market_contract = auction.market_contract AND bid.auction_id = auction.auction_id
            ORDER BY bid.bid_number ASC
        ) bids,

        auction.maker_marketplace,
        auction.taker_marketplace,

        auction.claimed_by_buyer,
        auction.claimed_by_seller,

        auction.collection_name,
        json_build_object(
            'collection_name', collection.collection_name,
            'name', collection.readable_name,
            'author', collection.author,
            'allow_notify', collection.allow_notify,
            'authorized_accounts', collection.authorized_accounts,
            'notify_accounts', collection.notify_accounts,
            'market_fee', auction.collection_fee,
            'created_at_block', collection.created_at_block,
            'created_at_time', collection.created_at_time
        ) collection,

        auction.state auction_state,

        EXISTS (
            SELECT * FROM atomicmarket_blacklist_collections list
            WHERE list.market_contract = auction.market_contract AND list.assets_contract = auction.assets_contract AND
                list.collection_name = auction.collection_name
        ) collection_blacklisted,
        EXISTS (
            SELECT * FROM atomicmarket_whitelist_collections list
            WHERE list.market_contract = auction.market_contract AND list.assets_contract = auction.assets_contract AND
                list.collection_name = auction.collection_name
        ) collection_whitelisted,
        EXISTS (
            SELECT * FROM atomicmarket_blacklist_accounts list
            WHERE list.market_contract = auction.market_contract AND list.account = auction.seller
        ) seller_blacklisted,
        EXISTS (
            SELECT * FROM atomicmarket_whitelist_accounts list
            WHERE list.market_contract = auction.market_contract AND list.account = auction.seller
        ) seller_whitelisted,

        auction.end_time,

        auction.updated_at_block,
        auction.updated_at_time,
        auction.created_at_block,
        auction.created_at_time,
        encode(auction.created_at_txid::bytea, 'hex') created_at_txid
    FROM atomicmarket_auctions auction, atomicassets_collections collection, atomicmarket_tokens token
    WHERE auction.market_contract = token.market_contract AND auction.token_symbol = token.token_symbol AND
        auction.assets_contract = collection.contract AND auction.collection_name = collection.collection_name
