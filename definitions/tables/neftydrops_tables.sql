CREATE TABLE neftydrops_drops
(
    drops_contract         character varying(12) NOT NULL,
    assets_contract        character varying(12) NOT NULL,
    drop_id                bigint                NOT NULL,
    collection_name        character varying(12),
    listing_price          bigint                NOT NULL,
    listing_symbol         character varying(12),
    settlement_symbol      character varying(12) NOT NULL,
    price_recipient        character varying(12),
    auth_required          boolean,
    preminted              boolean,
    account_limit          bigint                NOT NULL,
    account_limit_cooldown bigint                NOT NULL,
    max_claimable          bigint                NOT NULL,
    start_time             bigint                NOT NULL,
    end_time               bigint                NOT NULL,
    display_data           text                  NOT NULL,
    state                  smallint              NOT NULL,
    updated_at_block       bigint                NOT NULL,
    updated_at_time        bigint                NOT NULL,
    created_at_block       bigint                NOT NULL,
    created_at_time        bigint                NOT NULL,
    current_claimed        bigint                NOT NULL DEFAULT 0,

    CONSTRAINT neftydrops_drops_pkey PRIMARY KEY (drops_contract, drop_id)
);

CREATE TABLE neftydrops_drop_assets
(
    drops_contract  character varying(12) NOT NULL,
    assets_contract character varying(12) NOT NULL,
    drop_id         bigint                NOT NULL,
    collection_name character varying(12),
    template_id     bigint                NOT NULL,
    use_pool        boolean,
    tokens_to_back  character varying(100)[],
    "index"         integer               NOT NULL,

    CONSTRAINT neftydrops_drop_assets_pkey PRIMARY KEY (drops_contract, drop_id, index)
);

CREATE TABLE neftydrops_claims
(
    claim_id          bigint                NOT NULL,
    drops_contract    character varying(12) NOT NULL,
    assets_contract   character varying(12) NOT NULL,
    claimer           character varying(12) NOT NULL,
    drop_id           bigint                NOT NULL,
    collection_name   character varying(12),
    amount            bigint                NOT NULL,
    final_price       bigint,
    total_price       bigint,
    listing_symbol    character varying(12),
    settlement_symbol character varying(12),
    referrer          text                  NOT NULL,
    country           text                  NOT NULL,
    txid              bytea                 NOT NULL,
    created_at_block  bigint                NOT NULL,
    created_at_time   bigint                NOT NULL,
    amount_spent      bigint,
    spent_symbol      character varying(12),
    core_amount       bigint,
    core_symbol       character varying(12),
    CONSTRAINT neftydrops_claims_pkey PRIMARY KEY (drops_contract, claim_id)
);

CREATE TABLE neftydrops_balances
(
    drops_contract   character varying(12) NOT NULL,
    owner            character varying(12) NOT NULL,
    token_symbol     character varying(12) NOT NULL,
    amount           bigint                NOT NULL,
    updated_at_block bigint                NOT NULL,
    updated_at_time  bigint                NOT NULL
);

CREATE TABLE neftydrops_tokens
(
    drops_contract  character varying(12) NOT NULL,
    token_contract  character varying(12) NOT NULL,
    token_symbol    character varying(12) NOT NULL,
    token_precision integer               NOT NULL,
    CONSTRAINT neftydrops_tokens_pkey PRIMARY KEY (drops_contract, token_symbol)
);

CREATE TABLE neftydrops_symbol_pairs
(
    drops_contract     character varying(12) NOT NULL,
    listing_symbol     character varying(12) NOT NULL,
    settlement_symbol  character varying(12) NOT NULL,
    delphi_contract    character varying(12) NOT NULL,
    delphi_pair_name   character varying(12) NOT NULL,
    invert_delphi_pair boolean               NOT NULL,
    CONSTRAINT neftydrops_delphi_pairs_pkey PRIMARY KEY (drops_contract, listing_symbol, settlement_symbol)
);

CREATE TABLE neftydrops_config
(
    drops_contract     character varying(12) NOT NULL,
    assets_contract    character varying(12) NOT NULL,
    delphi_contract    character varying(12) NOT NULL,
    version            character varying(64) NOT NULL,
    drop_fee           double precision      NOT NULL,
    drop_fee_recipient character varying(12) NOT NULL,
    CONSTRAINT neftydrops_config_pkey PRIMARY KEY (drops_contract)
);

ALTER TABLE ONLY neftydrops_balances
    ADD CONSTRAINT neftydrops_balances_symbols_fkey FOREIGN KEY (token_symbol, drops_contract)
        REFERENCES neftydrops_tokens (token_symbol, drops_contract) MATCH SIMPLE ON
            UPDATE RESTRICT
        ON
            DELETE
            RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE ONLY neftydrops_symbol_pairs
    ADD CONSTRAINT neftydrops_symbol_pairs_delphi_fkey FOREIGN KEY (delphi_contract, delphi_pair_name)
        REFERENCES delphioracle_pairs (contract, delphi_pair_name) MATCH SIMPLE ON
            UPDATE RESTRICT
        ON
            DELETE
            RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE ONLY neftydrops_drop_assets
    ADD CONSTRAINT neftydrops_drop_assets_drop_fkey FOREIGN KEY (drop_id, drops_contract) REFERENCES neftydrops_drops (drop_id, drops_contract) MATCH SIMPLE ON
        UPDATE RESTRICT
        ON
            DELETE
            RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

-- Indexes
CREATE
    INDEX neftydrops_drops_drop_id ON neftydrops_drops USING btree (drop_id);
CREATE
    INDEX neftydrops_drops_collection_name ON neftydrops_drops USING hash (collection_name);
CREATE
    INDEX neftydrops_drops_collection_price ON neftydrops_drops USING btree (listing_price);
CREATE
    INDEX neftydrops_drops_collection_listing_symbol ON neftydrops_drops USING btree (listing_symbol);
CREATE
    INDEX neftydrops_drops_collection_settlement_symbol ON neftydrops_drops USING btree (settlement_symbol);
CREATE
    INDEX neftydrops_drops_collection_auth_required ON neftydrops_drops USING btree (auth_required);
CREATE
    INDEX neftydrops_drops_collection_preminted ON neftydrops_drops USING btree (preminted);
CREATE
    INDEX neftydrops_drops_collection_start_time ON neftydrops_drops USING btree (start_time);
CREATE
    INDEX neftydrops_drops_collection_end_time ON neftydrops_drops USING btree (end_time);
CREATE
    INDEX neftydrops_drops_created_at_time ON neftydrops_drops USING btree (created_at_time);
CREATE
    INDEX neftydrops_drops_updated_at_time ON neftydrops_drops USING btree (updated_at_time);

CREATE
    INDEX neftydrops_claims_drop_id ON neftydrops_claims USING btree (drop_id);
CREATE
    INDEX neftydrops_claims_amount ON neftydrops_claims USING btree (amount);
CREATE
    INDEX neftydrops_claims_final_price ON neftydrops_claims USING btree (final_price);
CREATE
    INDEX neftydrops_claims_total_price ON neftydrops_claims USING btree (total_price);
CREATE
    INDEX neftydrops_claims_listing_symbol ON neftydrops_claims USING hash (listing_symbol);
CREATE
    INDEX neftydrops_claims_settlement_symbol ON neftydrops_claims USING hash (settlement_symbol);
CREATE
    INDEX neftydrops_claims_referrer ON neftydrops_claims USING hash (referrer);
CREATE
    INDEX neftydrops_claims_country ON neftydrops_claims USING hash (country);
CREATE
    INDEX neftydrops_claims_claimer ON neftydrops_claims USING hash (claimer);
CREATE
    INDEX neftydrops_claims_created_at_time ON neftydrops_claims USING btree (created_at_time);

CREATE
    INDEX neftydrops_balances_owner ON neftydrops_balances USING btree (owner);

CREATE
    INDEX neftydrops_drop_assets_drop_id ON neftydrops_drop_assets USING btree (drop_id);
CREATE
    INDEX neftydrops_drop_assets_template_id ON neftydrops_drop_assets USING btree (template_id);
CREATE
    INDEX neftydrops_drop_assets_collection_name ON neftydrops_drop_assets USING btree (collection_name);
