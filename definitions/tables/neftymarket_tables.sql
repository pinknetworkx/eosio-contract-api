CREATE TABLE neftymarket_auctions
(
    market_contract character varying(12) NOT NULL,
    auction_id bigint NOT NULL,
    seller character varying(12) NOT NULL,
    buyer character varying(12),
    price bigint NOT NULL,
    min_price bigint NOT NULL,
    buy_now_price bigint,
    token_symbol character varying(12) NOT NULL,
    assets_contract character varying(12) NOT NULL,
    template_mint int4range,
    collection_name character varying(12),
    collection_fee double precision NOT NULL,
    claimed_by_buyer boolean,
    claimed_by_seller boolean,
    maker_marketplace character varying(12) NOT NULL,
    taker_marketplace character varying(12) NOT NULL,
    state smallint NOT NULL,
    start_time bigint NOT NULL,
    end_time bigint NOT NULL,
    auction_type int8 NOT NULL,
    discount_rate double precision,
    discount_interval bigint,
    updated_at_block bigint NOT NULL,
    updated_at_time bigint NOT NULL,
    created_at_block bigint NOT NULL,
    created_at_time bigint NOT NULL,
    CONSTRAINT neftymarket_auctions_pkey PRIMARY KEY (market_contract, auction_id)
);

CREATE TABLE neftymarket_auctions_bids
(
    market_contract character varying(12) NOT NULL,
    auction_id bigint NOT NULL,
    bid_number integer NOT NULL,
    account character varying(12) NOT NULL,
    amount bigint NOT NULL,
    txid bytea NOT NULL,
    created_at_block bigint NOT NULL,
    created_at_time bigint NOT NULL,
    CONSTRAINT neftymarket_auctions_bids_pkey PRIMARY KEY (market_contract, auction_id, bid_number)
);

CREATE TABLE neftymarket_auctions_assets
(
    market_contract character varying(12) NOT NULL,
    auction_id bigint NOT NULL,
    assets_contract character varying(12) NOT NULL,
    "index" integer NOT NULL,
    asset_id bigint NOT NULL,
    CONSTRAINT neftymarket_auctions_assets_pkey PRIMARY KEY (market_contract, auction_id, assets_contract, asset_id)
);

CREATE TABLE neftymarket_balances (
    market_contract character varying(12) NOT NULL,
    owner character varying(12) NOT NULL,
    token_symbol character varying(12) NOT NULL,
    amount bigint NOT NULL,
    updated_at_block bigint NOT NULL,
    updated_at_time bigint NOT NULL
);

CREATE TABLE neftymarket_config
(
    market_contract character varying(12) NOT NULL,
    assets_contract character varying(12) NOT NULL,
    market_fee double precision NOT NULL,
    min_bid_increase double precision NOT NULL,
    last_bid_threshold integer NOT NULL,
    fee_recipient character varying(12) NOT NULL,
    CONSTRAINT neftymarket_config_pkey PRIMARY KEY (market_contract)
);

CREATE TABLE neftymarket_tokens (
    market_contract character varying(12) NOT NULL,
    token_contract character varying(12) NOT NULL,
    token_symbol character varying(12) NOT NULL,
    token_precision integer NOT NULL,
    CONSTRAINT neftymarket_tokens_pkey PRIMARY KEY (market_contract, token_symbol)
);

-- Foreign Keys
ALTER TABLE ONLY neftymarket_auctions
    ADD CONSTRAINT neftymarket_auctions_token_symbol_fkey FOREIGN KEY (market_contract, token_symbol)
    REFERENCES neftymarket_tokens (market_contract, token_symbol) MATCH SIMPLE ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE ONLY neftymarket_auctions_bids
    ADD CONSTRAINT neftymarket_auctions_bids_auctions_fkey FOREIGN KEY (market_contract, auction_id)
    REFERENCES neftymarket_auctions (market_contract, auction_id) MATCH SIMPLE ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE ONLY neftymarket_auctions_assets
    ADD CONSTRAINT neftymarket_auctions_assets_auctions_fkey FOREIGN KEY (market_contract, auction_id)
    REFERENCES neftymarket_auctions (market_contract, auction_id) MATCH SIMPLE ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;


ALTER TABLE ONLY neftymarket_balances
    ADD CONSTRAINT neftymarket_balances_symbols_fkey FOREIGN KEY (token_symbol, market_contract)
    REFERENCES neftymarket_tokens (token_symbol, market_contract) MATCH SIMPLE ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

-- Indexes
CREATE INDEX neftymarket_auctions_auction_id ON neftymarket_auctions USING btree (auction_id);
CREATE INDEX neftymarket_auctions_seller ON neftymarket_auctions USING hash (seller);
CREATE INDEX neftymarket_auctions_buyer ON neftymarket_auctions USING hash (buyer);
CREATE INDEX neftymarket_auctions_price ON neftymarket_auctions USING btree (price);
CREATE INDEX neftymarket_auctions_buy_now_price ON neftymarket_auctions USING btree (buy_now_price);
CREATE INDEX neftymarket_auctions_collection_name ON neftymarket_auctions USING btree (collection_name);
CREATE INDEX neftymarket_auctions_state ON neftymarket_auctions USING btree (state);
CREATE INDEX neftymarket_auctions_type ON neftymarket_auctions USING btree (auction_type);
CREATE INDEX neftymarket_auctions_updated_at_time ON neftymarket_auctions USING btree (updated_at_time);
CREATE INDEX neftymarket_auctions_created_at_time ON neftymarket_auctions USING btree (created_at_time);
CREATE INDEX neftymarket_auctions_start_time ON neftymarket_auctions USING btree (start_time);
CREATE INDEX neftymarket_auctions_end_time ON neftymarket_auctions USING btree (end_time);

CREATE INDEX neftymarket_auctions_assets_asset_id ON neftymarket_auctions_assets USING btree (asset_id);

CREATE INDEX neftymarket_auctions_bids_account ON neftymarket_auctions_bids USING btree (account);
CREATE INDEX neftymarket_auctions_bids_created_at_time ON neftymarket_auctions_bids USING btree (created_at_time);

CREATE INDEX neftymarket_balances_owner ON neftymarket_balances USING btree (owner);

CREATE INDEX neftymarket_auctions_missing_mint ON neftymarket_auctions(assets_contract, auction_id) WHERE template_mint IS NULL;

CREATE INDEX neftymarket_auctions_auction_maker_marketplace ON neftymarket_auctions USING btree(maker_marketplace);
CREATE INDEX neftymarket_auctions_auction_taker_marketplace ON neftymarket_auctions USING btree(taker_marketplace);

