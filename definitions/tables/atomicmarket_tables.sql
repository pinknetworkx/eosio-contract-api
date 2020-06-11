CREATE TABLE atomicmarket_auctions
(
    market_contract character varying(12) NOT NULL,
    auction_id integer NOT NULL,
    seller character varying(12) NOT NULL,
    price bigint NOT NULL,
    token_symbol character varying(12) NOT NULL,
    asset_contract character varying(12) NOT NULL,
    maker_marketplace character varying(12) NOT NULL,
    taker_marketplace character varying(12),
    collection_name character varying(12),
    collection_fee double precision NOT NULL,
    claimed_by_buyer bigint,
    claimed_by_seller bigint,
    state smallint NOT NULL,
    updated_at_block bigint NOT NULL,
    updated_at_time bigint NOT NULL,
    created_at_block bigint NOT NULL,
    created_at_time bigint NOT NULL,
    CONSTRAINT atomicmarket_auctions_pkey PRIMARY KEY (market_contract, auction_id)
);

CREATE TABLE atomicmarket_auctions_bids
(
    market_contract character varying(12) NOT NULL,
    auction_id integer NOT NULL,
    bid_number integer NOT NULL,
    account character varying(12) NOT NULL,
    amount bigint NOT NULL,
    created_at_block bigint NOT NULL,
    created_at_time bigint NOT NULL,
    CONSTRAINT atomicmarket_auctions_bids_pkey PRIMARY KEY (market_contract, auction_id, bid_number)
);

CREATE TABLE atomicmarket_auctions_assets
(
    market_contract character varying(12) NOT NULL,
    auction_id integer NOT NULL,
    asset_contract character varying(12) NOT NULL,
    asset_id bigint NOT NULL,
    CONSTRAINT atomicmarket_auctions_assets_pkey PRIMARY KEY (market_contract, auction_id, asset_contract, asset_id)
);

CREATE TABLE atomicmarket_balances (
    market_contract character varying(12) NOT NULL,
    owner character varying(12) NOT NULL,
    token_symbol character varying(12) NOT NULL,
    amount bigint NOT NULL,
    updated_at_block bigint NOT NULL,
    updated_at_time bigint NOT NULL
);

CREATE TABLE atomicmarket_config
(
    market_contract character varying(12) NOT NULL,
    asset_contract character varying(12) NOT NULL,
    delphi_contract character varying(12) NOT NULL,
    version character varying(12) NOT NULL,
    maker_market_fee double precision NOT NULL,
    taker_market_fee double precision NOT NULL,
    maximum_auction_duration integer NOT NULL,
    minimum_bid_increase double precision NOT NULL,
    CONSTRAINT atomicmarket_config_pkey PRIMARY KEY (market_contract)
);

CREATE TABLE atomicmarket_tokens (
    market_contract character varying(12) NOT NULL,
    token_contract character varying(12) NOT NULL,
    token_symbol character varying(12) NOT NULL,
    token_precision character varying(12) NOT NULL,
    CONSTRAINT atomicmarket_tokens_pkey PRIMARY KEY (market_contract, token_symbol)
);

CREATE TABLE atomicmarket_symbol_pairs (
    market_contract character varying(12) NOT NULL,
    listing_symbol character varying(12) NOT NULL,
    settlement_symbol character varying(12) NOT NULL,
    delphi_contract character varying(12) NOT NULL,
    delphi_pair_name character varying(12),
    CONSTRAINT atomicmarket_delphi_pairs_pkey PRIMARY KEY (market_contract, listing_symbol, settlement_symbol)
);

CREATE TABLE atomicmarket_marketplaces
(
    market_contract character varying(12) NOT NULL,
    marketplace_name character varying(12) NOT NULL,
    creator character varying(12) NOT NULL,
    created_at_block bigint NOT NULL,
    created_at_time bigint NOT NULL,
    CONSTRAINT atomicmarket_marketplaces_pkey PRIMARY KEY (market_contract, marketplace_name)
);

CREATE TABLE atomicmarket_sales
(
    market_contract character varying(12) NOT NULL,
    sale_id integer NOT NULL,
    seller character varying(12) NOT NULL,
    listing_price bigint NOT NULL,
    final_price bigint,
    token_symbol character varying(12),
    listing_symbol character varying(12),
    settlement_symbol character varying(12),
    asset_contract character varying(12) NOT NULL,
    offer_id bigint NOT NULL,
    maker_marketplace character varying(12) NOT NULL,
    taker_marketplace character varying(12),
    collection_name character varying(12),
    collection_fee double precision NOT NULL,
    state smallint NOT NULL,
    updated_at_block bigint NOT NULL,
    updated_at_time bigint NOT NULL,
    created_at_block bigint NOT NULL,
    created_at_time bigint NOT NULL,
    CONSTRAINT atomicmarket_sales_pkey PRIMARY KEY (market_contract, sale_id),
    CONSTRAINT atomicmarket_sales_offer_id_key UNIQUE (market_contract, asset_contract, offer_id)
);

CREATE TABLE atomicmarket_blacklist_accounts (
    market_contract character varying(12) NOT NULL,
    account character varying(12) NOT NULL,
    CONSTRAINT atomicmarket_blacklist_sellers_pkey PRIMARY KEY (market_contract, seller)
);

CREATE TABLE atomicmarket_blacklist_collections (
    market_contract character varying(12) NOT NULL,
    asset_contract character varying(12) NOT NULL,
    collection_name character varying(12) NOT NULL,
    CONSTRAINT atomicmarket_blacklist_collections_pkey PRIMARY KEY (market_contract, asset_contract, collection_name)
);

CREATE TABLE atomicmarket_whitelist_accounts (
    market_contract character varying(12) NOT NULL,
    account character varying(12) NOT NULL,
    CONSTRAINT atomicmarket_whitelist_sellers_pkey PRIMARY KEY (market_contract, seller)
);

CREATE TABLE atomicmarket_whitelist_collections (
    market_contract character varying(12) NOT NULL,
    asset_contract character varying(12) NOT NULL,
    collection_name character varying(12) NOT NULL,
    CONSTRAINT atomicmarket_whitelist_collections_pkey PRIMARY KEY (market_contract, asset_contract, collection_name)
);

-- Foreign Keys
ALTER TABLE ONLY atomicmarket_auctions
    ADD CONSTRAINT atomicmarket_auctions_collection_name_fkey FOREIGN KEY (collection_name, asset_contract)
    REFERENCES atomicassets_collections (collection_name, contract) MATCH SIMPLE ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE ONLY atomicmarket_auctions
    ADD CONSTRAINT atomicmarket_auctions_token_symbol_fkey FOREIGN KEY (market_contract, token_symbol)
    REFERENCES atomicmarket_tokens (market_contract, token_symbol) MATCH SIMPLE ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE ONLY atomicmarket_auctions
    ADD CONSTRAINT atomicmarket_auctions_maker_marketplace_fkey FOREIGN KEY (market_contract, maker_marketplace)
    REFERENCES atomicmarket_marketplaces (market_contract, marketplace_name) MATCH SIMPLE ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE ONLY atomicmarket_auctions
    ADD CONSTRAINT atomicmarket_auctions_taker_marketplace_fkey FOREIGN KEY (market_contract, taker_marketplace)
    REFERENCES atomicmarket_marketplaces (market_contract, marketplace_name) MATCH SIMPLE ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;



ALTER TABLE ONLY atomicmarket_auctions_bids
    ADD CONSTRAINT atomicmarket_auctions_bids_auctions_fkey FOREIGN KEY (market_contract, auction_id)
    REFERENCES atomicmarket_auctions (market_contract, auction_id) MATCH SIMPLE ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE ONLY atomicmarket_auctions_assets
    ADD CONSTRAINT atomicmarket_auctions_assets_auctions_fkey FOREIGN KEY (market_contract, auction_id)
    REFERENCES atomicmarket_auctions (market_contract, auction_id) MATCH SIMPLE ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE ONLY atomicmarket_auctions_assets
    ADD CONSTRAINT atomicmarket_auctions_assets_assets_fkey FOREIGN KEY (asset_contract, asset_id)
    REFERENCES atomicassets_assets (contract, asset_id) MATCH SIMPLE ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;



ALTER TABLE ONLY atomicmarket_balances
    ADD CONSTRAINT atomicmarket_balances_symbols_fkey FOREIGN KEY (token_symbol, market_contract)
    REFERENCES atomicmarket_tokens (token_symbol, market_contract) MATCH SIMPLE ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE ONLY atomicmarket_symbol_pairs
    ADD CONSTRAINT atomicmarket_symbol_pairs_delphi_fkey FOREIGN KEY (delphi_contract, delphi_pair_name)
    REFERENCES delphioracle_pairs (contract, delphi_pair_name) MATCH SIMPLE ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;



ALTER TABLE ONLY atomicmarket_sales
    ADD CONSTRAINT atomicmarket_sales_offer_id_fkey FOREIGN KEY (offer_id, asset_contract)
    REFERENCES atomicassets_offers (offer_id, contract) MATCH SIMPLE ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE ONLY atomicmarket_sales
    ADD CONSTRAINT atomicmarket_sales_delphi_fkey FOREIGN KEY (market_contract, listing_symbol, settlement_symbol)
    REFERENCES atomicmarket_symbol_pairs (market_contract, listing_symbol, settlement_symbol) MATCH SIMPLE ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE ONLY atomicmarket_sales
    ADD CONSTRAINT atomicmarket_sales_token_symbol_fkey FOREIGN KEY (market_contract, token_symbol)
    REFERENCES atomicmarket_tokens (market_contract, token_symbol) MATCH SIMPLE ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;



ALTER TABLE ONLY atomicmarket_whitelist_collections
    ADD CONSTRAINT atomicmarket_whitelist_collections_collection_fkey FOREIGN KEY (asset_contract, collection_name)
    REFERENCES atomicassets_collections (contract, collection_name) MATCH SIMPLE ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE ONLY atomicmarket_blacklist_collections
    ADD CONSTRAINT atomicmarket_blacklist_collections_collection_fkey FOREIGN KEY (asset_contract, collection_name)
    REFERENCES atomicassets_collections (contract, collection_name) MATCH SIMPLE ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

-- Indexes
CREATE INDEX atomicmarket_auctions_market_contract ON atomicmarket_auctions USING hash (market_contract);
CREATE INDEX atomicmarket_auctions_asset_contract ON atomicmarket_auctions USING hash (asset_contract);
CREATE INDEX atomicmarket_auctions_seller ON atomicmarket_auctions USING hash (seller);
CREATE INDEX atomicmarket_auctions_price ON atomicmarket_sales USING btree (price);
CREATE INDEX atomicmarket_auctions_maker_marketplace ON atomicmarket_auctions USING hash (maker_marketplace);
CREATE INDEX atomicmarket_auctions_taker_marketplace ON atomicmarket_auctions USING hash (taker_marketplace);
CREATE INDEX atomicmarket_auctions_state ON atomicmarket_auctions USING btree (state);
CREATE INDEX atomicmarket_auctions_updated_at_block ON atomicmarket_auctions USING btree (updated_at_block);
CREATE INDEX atomicmarket_auctions_created_at_block ON atomicmarket_auctions USING btree (created_at_block);

CREATE INDEX atomicmarket_auctions_bids_market_contract ON atomicmarket_auctions_bids USING hash (market_contract);
CREATE INDEX atomicmarket_auctions_bids_account ON atomicmarket_auctions_bids USING btree (account);
CREATE INDEX atomicmarket_auctions_bids_amount ON atomicmarket_auctions_bids USING btree (amount);
CREATE INDEX atomicmarket_auctions_bids_created_at_block ON atomicmarket_auctions_bids USING btree (created_at_block);

CREATE INDEX atomicmarket_auctions_assets_market_contract ON atomicmarket_auctions_assets USING hash (market_contract);
CREATE INDEX atomicmarket_auctions_assets_asset_contract ON atomicmarket_auctions_assets USING hash (asset_contract);

CREATE INDEX atomicmarket_balances_market_contract ON atomicmarket_balances USING hash (market_contract);
CREATE INDEX atomicmarket_balances_owner ON atomicmarket_balances USING hash (owner);
CREATE INDEX atomicmarket_balances_updated_at_block ON atomicmarket_balances USING btree (updated_at_block);

CREATE INDEX atomicmarket_sales_market_contract ON atomicmarket_sales USING hash (market_contract);
CREATE INDEX atomicmarket_sales_asset_contract ON atomicmarket_sales USING hash (asset_contract);
CREATE INDEX atomicmarket_sales_seller ON atomicmarket_sales USING hash (seller);
CREATE INDEX atomicmarket_sales_price ON atomicmarket_sales USING btree (price);
CREATE INDEX atomicmarket_sales_maker_marketplace ON atomicmarket_sales USING hash (maker_marketplace);
CREATE INDEX atomicmarket_sales_taker_marketplace ON atomicmarket_sales USING hash (taker_marketplace);
CREATE INDEX atomicmarket_sales_state ON atomicmarket_sales USING btree (state);
CREATE INDEX atomicmarket_sales_updated_at_block ON atomicmarket_sales USING btree (updated_at_block);
CREATE INDEX atomicmarket_sales_created_at_block ON atomicmarket_sales USING btree (created_at_block);
