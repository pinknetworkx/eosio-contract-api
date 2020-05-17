-- CREATE TABLES --
CREATE TABLE atomicassets_assets (
    contract bigint NOT NULL,
    asset_id bigint NOT NULL,
    collection_name bigint NOT NULL,
    scheme_name bigint NOT NULL,
    preset_id bigint,
    owner bigint NOT NULL,
    readable_name character varying(64),
    ram_payer bigint NOT NULL,
    burned_at_block bigint,
    burned_at_time bigint,
    updated_at_block bigint NOT NULL,
    updated_at_time bigint NOT NULL,
    minted_at_block bigint NOT NULL,
    minted_at_time bigint NOT NULL
);

CREATE TABLE atomicassets_assets_backed_tokens (
    contract bigint NOT NULL,
    asset_id bigint NOT NULL,
    token_symbol bigint NOT NULL,
    amount bigint NOT NULL,
    updated_at_block bigint NOT NULL,
    updated_at_time bigint NOT NULL
);

CREATE TABLE atomicassets_assets_data (
    contract bigint NOT NULL,
    asset_id bigint NOT NULL,
    "key" character varying(64) NOT NULL,
    "value" json NOT NULL,
    mutable boolean NOT NULL,
    updated_at_block bigint NOT NULL,
    updated_at_time bigint NOT NULL
);

CREATE TABLE atomicassets_balances (
    contract bigint NOT NULL,
    owner bigint NOT NULL,
    token_symbol bigint NOT NULL,
    amount bigint NOT NULL,
    updated_at_block bigint NOT NULL,
    updated_at_time bigint NOT NULL
);

CREATE TABLE atomicassets_collections (
    contract bigint NOT NULL,
    collection_name bigint NOT NULL,
    readable_name character varying(64),
    author bigint NOT NULL,
    allow_notify boolean NOT NULL,
    authorized_accounts bigint[] NOT NULL,
    notify_accounts bigint[] NOT NULL,
    market_fee double precision NOT NULL,
    data json,
    created_at_block bigint NOT NULL,
    created_at_time bigint NOT NULL
);

CREATE TABLE atomicassets_config (
    contract bigint NOT NULL,
    version character varying(64) NOT NULL,
    collection_format json[] NOT NULL
);

CREATE TABLE atomicassets_logs (
    log_id integer NOT NULL,
    contract bigint NOT NULL,
    name character varying(64) NOT NULL,
    relation_name character varying(64) NOT NULL,
    relation_id character varying(256) NOT NULL,
    data json NOT NULL,
    txid bytea NOT NULL,
    created_at_block bigint NOT NULL,
    created_at_time bigint NOT NULL
);

CREATE SEQUENCE atomicassets_logs_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE atomicassets_logs_log_id_seq OWNED BY atomicassets_logs.log_id;

CREATE TABLE atomicassets_offers (
    contract bigint NOT NULL,
    offer_id bigint NOT NULL,
    sender bigint NOT NULL,
    recipient bigint NOT NULL,
    memo character varying(256) NOT NULL,
    state smallint NOT NULL,
    updated_at_time bigint NOT NULL,
    updated_at_block bigint NOT NULL,
    created_at_time bigint NOT NULL,
    created_at_block bigint NOT NULL
);

CREATE TABLE atomicassets_offers_assets (
    contract bigint NOT NULL,
    offer_id bigint NOT NULL,
    owner bigint NOT NULL,
    asset_id bigint NOT NULL,
    state smallint NOT NULL
);

CREATE TABLE atomicassets_presets (
    contract bigint NOT NULL,
    preset_id bigint NOT NULL,
    collection_name bigint NOT NULL,
    scheme_name bigint NOT NULL,
    readable_name character varying(64),
    transferable boolean NOT NULL,
    burnable boolean NOT NULL,
    max_supply bigint NOT NULL,
    issued_supply bigint NOT NULL,
    created_at_time bigint NOT NULL,
    created_at_block bigint NOT NULL
);

CREATE TABLE atomicassets_presets_data (
    contract bigint NOT NULL,
    preset_id bigint NOT NULL,
    "key" character varying(64) NOT NULL,
    "value" json NOT NULL
);

CREATE TABLE atomicassets_schemes (
    contract bigint NOT NULL,
    collection_name bigint NOT NULL,
    scheme_name bigint NOT NULL,
    format json[] NOT NULL,
    created_at_block bigint NOT NULL,
    created_at_time bigint NOT NULL
);

CREATE TABLE atomicassets_token_symbols (
    contract bigint NOT NULL,
    token_symbol bigint NOT NULL,
    token_contract bigint NOT NULL,
    token_precision integer NOT NULL
);

CREATE TABLE atomicassets_transfers (
    transfer_id integer NOT NULL,
    contract bigint NOT NULL,
    "sender" bigint NOT NULL,
    "recipient" bigint NOT NULL,
    memo character varying(256) NOT NULL,
    txid bytea NOT NULL,
    created_at_block bigint NOT NULL,
    created_at_time bigint NOT NULL
);

CREATE TABLE atomicassets_transfers_assets (
    transfer_id integer NOT NULL,
    contract bigint NOT NULL,
    asset_id bigint NOT NULL
);

CREATE SEQUENCE atomicassets_transfers_transfer_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE atomicassets_transfers_transfer_id_seq OWNED BY atomicassets_transfers.transfer_id;


-- SEQUENCES --
ALTER TABLE ONLY atomicassets_logs ALTER COLUMN log_id SET DEFAULT nextval('atomicassets_logs_log_id_seq'::regclass);

ALTER TABLE ONLY atomicassets_transfers ALTER COLUMN transfer_id SET DEFAULT nextval('atomicassets_transfers_transfer_id_seq'::regclass);

-- PRIMARY KEYS --
ALTER TABLE ONLY atomicassets_assets_backed_tokens
    ADD CONSTRAINT atomicassets_assets_backed_tokens_pkey PRIMARY KEY (contract, asset_id, token_symbol);

ALTER TABLE ONLY atomicassets_assets_data
    ADD CONSTRAINT atomicassets_assets_data_pkey PRIMARY KEY (contract, asset_id, "key", mutable);

ALTER TABLE ONLY atomicassets_assets
    ADD CONSTRAINT atomicassets_assets_pkey PRIMARY KEY (contract, asset_id);

ALTER TABLE ONLY atomicassets_balances
    ADD CONSTRAINT atomicassets_balances_pkey PRIMARY KEY (contract, owner, token_symbol);

ALTER TABLE ONLY atomicassets_collections
    ADD CONSTRAINT atomicassets_collections_pkey PRIMARY KEY (contract, collection_name);

ALTER TABLE ONLY atomicassets_config
    ADD CONSTRAINT atomicassets_config_pkey PRIMARY KEY (contract);

ALTER TABLE ONLY atomicassets_logs
    ADD CONSTRAINT atomicassets_logs_pkey PRIMARY KEY (log_id);

ALTER TABLE ONLY atomicassets_offers_assets
    ADD CONSTRAINT atomicassets_offers_assets_pkey PRIMARY KEY (contract, offer_id, asset_id);

ALTER TABLE ONLY atomicassets_offers
    ADD CONSTRAINT atomicassets_offers_pkey PRIMARY KEY (contract, offer_id);

ALTER TABLE ONLY atomicassets_presets_data
    ADD CONSTRAINT atomicassets_presets_data_pkey PRIMARY KEY (contract, preset_id, "key");

ALTER TABLE ONLY atomicassets_presets
    ADD CONSTRAINT atomicassets_presets_pkey PRIMARY KEY (contract, preset_id);

ALTER TABLE ONLY atomicassets_schemes
    ADD CONSTRAINT atomicassets_schemes_pkey PRIMARY KEY (contract, collection_name, scheme_name);

ALTER TABLE ONLY atomicassets_token_symbols
    ADD CONSTRAINT atomicassets_token_symbols_pkey PRIMARY KEY (contract, token_symbol);

ALTER TABLE ONLY atomicassets_transfers_assets
    ADD CONSTRAINT atomicassets_transfers_assets_pkey PRIMARY KEY (transfer_id, contract, asset_id);

ALTER TABLE ONLY atomicassets_transfers
    ADD CONSTRAINT atomicassets_transfers_pkey PRIMARY KEY (transfer_id);

-- INDEXES --
CREATE INDEX atomicassets_assets_contract ON atomicassets_assets USING btree (contract);
CREATE INDEX atomicassets_assets_collection_name ON atomicassets_assets USING btree (contract, collection_name);
CREATE INDEX atomicassets_assets_preset_id ON atomicassets_assets USING btree (contract, preset_id);
CREATE INDEX atomicassets_assets_scheme_name ON atomicassets_assets USING btree (contract, scheme_name);
CREATE INDEX atomicassets_assets_owner ON atomicassets_assets USING btree (contract, owner);
CREATE INDEX atomicassets_assets_readable_name ON atomicassets_assets USING btree (contract, readable_name);
CREATE INDEX atomicassets_assets_burned_at_block ON atomicassets_assets USING btree (contract, burned_at_block);
CREATE INDEX atomicassets_assets_updated_at_block ON atomicassets_assets USING btree (contract, updated_at_block);
CREATE INDEX atomicassets_assets_minted_at_block ON atomicassets_assets USING btree (contract, minted_at_block);

CREATE INDEX atomicassets_assets_backed_tokens_asset_id ON atomicassets_assets_backed_tokens USING btree (contract, asset_id);
CREATE INDEX atomicassets_assets_backed_tokens_token_symbol ON atomicassets_assets_backed_tokens USING btree (contract, token_symbol);
CREATE INDEX atomicassets_assets_backed_tokens_updated_at_block ON atomicassets_assets_backed_tokens USING btree (contract, updated_at_block);

CREATE INDEX atomicassets_assets_data_asset_id ON atomicassets_assets_data USING btree (contract, contract, asset_id);
CREATE INDEX atomicassets_assets_data_asset_key ON atomicassets_assets_data USING btree (contract, "key");
CREATE INDEX atomicassets_assets_data_updated_at_block ON atomicassets_assets_data USING btree (contract, updated_at_block);
CREATE INDEX atomicassets_assets_data_updated_mutable ON atomicassets_assets_data USING btree (contract, mutable);

CREATE INDEX atomicassets_balances_owner ON atomicassets_balances USING btree (contract, owner);
CREATE INDEX atomicassets_balances_token_symbol ON atomicassets_balances USING btree (contract, token_symbol);
CREATE INDEX atomicassets_balances_updated_at_block ON atomicassets_balances USING btree (contract, updated_at_block);

CREATE INDEX atomicassets_collections_contract ON atomicassets_collections USING btree (contract);
CREATE INDEX atomicassets_collections_readable_name ON atomicassets_collections USING btree (contract, readable_name);
CREATE INDEX atomicassets_collections_author ON atomicassets_collections USING btree (contract, author);
CREATE INDEX atomicassets_collections_created_at_block ON atomicassets_collections USING btree (contract, created_at_block);

CREATE INDEX atomicassets_logs_name ON atomicassets_logs USING btree (contract, name);
CREATE INDEX atomicassets_logs_relation_name ON atomicassets_logs USING btree (contract, relation_name);
CREATE INDEX atomicassets_logs_relation_id ON atomicassets_logs USING btree (contract, relation_id);
CREATE INDEX atomicassets_logs_created_at_block ON atomicassets_logs USING btree (contract, created_at_block);

CREATE INDEX atomicassets_offers_contract ON atomicassets_offers USING btree (contract);
CREATE INDEX atomicassets_offers_sender ON atomicassets_offers USING btree (contract, sender);
CREATE INDEX atomicassets_offers_recipient ON atomicassets_offers USING btree (contract, recipient);
CREATE INDEX atomicassets_offers_state ON atomicassets_offers USING btree (contract, state);
CREATE INDEX atomicassets_offers_updated_at_block ON atomicassets_offers USING btree (contract, updated_at_block);
CREATE INDEX atomicassets_offers_created_at_block ON atomicassets_offers USING btree (contract, created_at_block);

CREATE INDEX atomicassets_offers_assets_offer_id ON atomicassets_offers_assets USING btree (contract, offer_id);
CREATE INDEX atomicassets_offers_assets_owner ON atomicassets_offers_assets USING btree (contract, owner);
CREATE INDEX atomicassets_offers_assets_state ON atomicassets_offers_assets USING btree (contract, state);

CREATE INDEX atomicassets_presets_contract ON atomicassets_presets USING btree (contract);
CREATE INDEX atomicassets_presets_collection_name ON atomicassets_presets USING btree (contract, collection_name);
CREATE INDEX atomicassets_presets_scheme_name ON atomicassets_presets USING btree (contract, scheme_name);
CREATE INDEX atomicassets_presets_readable_name ON atomicassets_presets USING btree (contract, readable_name);
CREATE INDEX atomicassets_presets_created_at_block ON atomicassets_presets USING btree (contract, created_at_block);

CREATE INDEX atomicassets_presets_data_preset_id ON atomicassets_presets_data USING btree (contract, preset_id);
CREATE INDEX atomicassets_presets_data_key ON atomicassets_presets_data USING btree (contract, "key");

CREATE INDEX atomicassets_schemes_contract ON atomicassets_schemes USING btree (contract);
CREATE INDEX atomicassets_schemes_collection_name ON atomicassets_schemes USING btree (contract, collection_name);
CREATE INDEX atomicassets_schemes_created_at_block ON atomicassets_schemes USING btree (contract, created_at_block);

CREATE INDEX atomicassets_token_symbols_contract ON atomicassets_token_symbols USING btree (contract);

CREATE INDEX atomicassets_transfers_contract ON atomicassets_transfers USING btree (contract);
CREATE INDEX atomicassets_transfers_sender ON atomicassets_transfers USING btree (contract, sender);
CREATE INDEX atomicassets_transfers_recipient ON atomicassets_transfers USING btree (contract, recipient);
CREATE INDEX atomicassets_transfers_created_at_block ON atomicassets_transfers USING btree (contract, created_at_block);

-- FOREIGN KEYS --
ALTER TABLE ONLY atomicassets_assets_backed_tokens
    ADD CONSTRAINT atomicassets_assets_backed_tokens_assets FOREIGN KEY (asset_id, contract) REFERENCES atomicassets_assets(asset_id, contract) MATCH SIMPLE ON UPDATE CASCADE ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE ONLY atomicassets_assets_backed_tokens
    ADD CONSTRAINT atomicassets_assets_backed_tokens_symbol FOREIGN KEY (token_symbol, contract) REFERENCES atomicassets_token_symbols(token_symbol, contract) MATCH SIMPLE ON UPDATE CASCADE ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE ONLY atomicassets_assets
    ADD CONSTRAINT atomicassets_assets_collections FOREIGN KEY (contract, collection_name) REFERENCES atomicassets_collections(contract, collection_name) MATCH SIMPLE ON UPDATE CASCADE ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE ONLY atomicassets_assets_data
    ADD CONSTRAINT atomicassets_assets_data_assets FOREIGN KEY (asset_id, contract) REFERENCES atomicassets_assets(asset_id, contract) MATCH SIMPLE ON UPDATE CASCADE ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE ONLY atomicassets_assets
    ADD CONSTRAINT atomicassets_assets_presets FOREIGN KEY (preset_id, contract) REFERENCES atomicassets_presets(preset_id, contract) MATCH SIMPLE ON UPDATE CASCADE ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE ONLY atomicassets_assets
    ADD CONSTRAINT atomicassets_assets_schemes FOREIGN KEY (collection_name, scheme_name, contract) REFERENCES atomicassets_schemes(collection_name, scheme_name, contract) MATCH SIMPLE ON UPDATE CASCADE ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE ONLY atomicassets_balances
    ADD CONSTRAINT atomicassets_balances_symbols FOREIGN KEY (token_symbol, contract) REFERENCES atomicassets_token_symbols(token_symbol, contract) MATCH SIMPLE ON UPDATE CASCADE ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE ONLY atomicassets_offers_assets
    ADD CONSTRAINT atomicassets_offers_assets_assets FOREIGN KEY (asset_id, contract) REFERENCES atomicassets_assets(asset_id, contract) MATCH SIMPLE ON UPDATE CASCADE ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE ONLY atomicassets_offers_assets
    ADD CONSTRAINT atomicassets_offers_assets_offers FOREIGN KEY (offer_id, contract) REFERENCES atomicassets_offers(offer_id, contract) MATCH SIMPLE ON UPDATE CASCADE ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE ONLY atomicassets_presets
    ADD CONSTRAINT atomicassets_presets_collections FOREIGN KEY (collection_name, contract) REFERENCES atomicassets_collections(collection_name, contract) MATCH SIMPLE ON UPDATE CASCADE ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE ONLY atomicassets_presets_data
    ADD CONSTRAINT atomicassets_presets_data_presets FOREIGN KEY (preset_id, contract) REFERENCES atomicassets_presets(preset_id, contract) MATCH SIMPLE ON UPDATE CASCADE ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE ONLY atomicassets_presets
    ADD CONSTRAINT atomicassets_presets_schemes FOREIGN KEY (collection_name, scheme_name, contract) REFERENCES atomicassets_schemes(collection_name, scheme_name, contract) MATCH SIMPLE ON UPDATE CASCADE ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE ONLY atomicassets_schemes
    ADD CONSTRAINT atomicassets_schemes_collection FOREIGN KEY (collection_name, contract) REFERENCES atomicassets_collections(collection_name, contract) MATCH SIMPLE ON UPDATE CASCADE ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE ONLY atomicassets_transfers_assets
    ADD CONSTRAINT atomicassets_transfers_assets_assets FOREIGN KEY (asset_id, contract) REFERENCES atomicassets_assets(asset_id, contract) MATCH SIMPLE ON UPDATE CASCADE ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE ONLY atomicassets_transfers_assets
    ADD CONSTRAINT atomicassets_transfers_assets_transfers FOREIGN KEY (transfer_id) REFERENCES atomicassets_transfers(transfer_id) MATCH SIMPLE ON UPDATE CASCADE ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;
