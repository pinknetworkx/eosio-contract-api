-- CREATE TABLES --
CREATE TABLE atomicassets_assets (
    contract character varying(12) NOT NULL,
    asset_id bigint NOT NULL,
    collection_name character varying(12) NOT NULL,
    schema_name character varying(12) NOT NULL,
    template_id bigint,
    owner character varying(12),
    readable_name character varying(64),
    ram_payer character varying(12) NOT NULL,
    burned_at_block bigint,
    burned_at_time bigint,
    updated_at_block bigint NOT NULL,
    updated_at_time bigint NOT NULL,
    minted_at_block bigint NOT NULL,
    minted_at_time bigint NOT NULL
);

CREATE TABLE atomicassets_assets_backed_tokens (
    contract character varying(12) NOT NULL,
    asset_id bigint NOT NULL,
    token_symbol character varying(12) NOT NULL,
    amount bigint NOT NULL,
    updated_at_block bigint NOT NULL,
    updated_at_time bigint NOT NULL
);

CREATE TABLE atomicassets_assets_data (
    contract character varying(12) NOT NULL,
    asset_id bigint NOT NULL,
    "key" character varying(64) NOT NULL,
    "value" json NOT NULL,
    mutable boolean NOT NULL,
    updated_at_block bigint NOT NULL,
    updated_at_time bigint NOT NULL
);

CREATE TABLE atomicassets_balances (
    contract character varying(12) NOT NULL,
    owner character varying(12) NOT NULL,
    token_symbol character varying(12) NOT NULL,
    amount bigint NOT NULL,
    updated_at_block bigint NOT NULL,
    updated_at_time bigint NOT NULL
);

CREATE TABLE atomicassets_collections (
    contract character varying(12) NOT NULL,
    collection_name character varying(12) NOT NULL,
    readable_name character varying(64),
    author character varying(12) NOT NULL,
    allow_notify boolean NOT NULL,
    authorized_accounts character varying(12)[] NOT NULL,
    notify_accounts character varying(12)[] NOT NULL,
    market_fee double precision NOT NULL,
    data json,
    created_at_block bigint NOT NULL,
    created_at_time bigint NOT NULL
);

CREATE TABLE atomicassets_config (
    contract character varying(12) NOT NULL,
    version character varying(64) NOT NULL,
    collection_format json[] NOT NULL
);

CREATE TABLE atomicassets_logs (
    log_id integer NOT NULL,
    contract character varying(12) NOT NULL,
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
    contract character varying(12) NOT NULL,
    offer_id bigint NOT NULL,
    sender character varying(12) NOT NULL,
    recipient character varying(12) NOT NULL,
    memo character varying(256) NOT NULL,
    state smallint NOT NULL,
    updated_at_time bigint NOT NULL,
    updated_at_block bigint NOT NULL,
    created_at_time bigint NOT NULL,
    created_at_block bigint NOT NULL
);

CREATE TABLE atomicassets_offers_assets (
    contract character varying(12) NOT NULL,
    offer_id bigint NOT NULL,
    owner character varying(12) NOT NULL,
    asset_id bigint NOT NULL
);

CREATE TABLE atomicassets_templates (
    contract character varying(12) NOT NULL,
    template_id bigint NOT NULL,
    collection_name character varying(12) NOT NULL,
    schema_name character varying(12) NOT NULL,
    readable_name character varying(64),
    transferable boolean NOT NULL,
    burnable boolean NOT NULL,
    max_supply bigint NOT NULL,
    issued_supply bigint NOT NULL,
    created_at_time bigint NOT NULL,
    created_at_block bigint NOT NULL
);

CREATE TABLE atomicassets_templates_data (
    contract character varying(12) NOT NULL,
    template_id bigint NOT NULL,
    "key" character varying(64) NOT NULL,
    "value" json NOT NULL
);

CREATE TABLE atomicassets_schemas (
    contract character varying(12) NOT NULL,
    collection_name character varying(12) NOT NULL,
    schema_name character varying(12) NOT NULL,
    format json[] NOT NULL,
    created_at_block bigint NOT NULL,
    created_at_time bigint NOT NULL
);

CREATE TABLE atomicassets_token_symbols (
    contract character varying(12) NOT NULL,
    token_symbol character varying(12) NOT NULL,
    token_contract character varying(12) NOT NULL,
    token_precision integer NOT NULL
);

CREATE TABLE atomicassets_transfers (
    transfer_id integer NOT NULL,
    contract character varying(12) NOT NULL,
    "sender" character varying(12) NOT NULL,
    "recipient" character varying(12) NOT NULL,
    memo character varying(256) NOT NULL,
    txid bytea NOT NULL,
    created_at_block bigint NOT NULL,
    created_at_time bigint NOT NULL
);

CREATE TABLE atomicassets_transfers_assets (
    transfer_id integer NOT NULL,
    contract character varying(12) NOT NULL,
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

ALTER TABLE ONLY atomicassets_templates_data
    ADD CONSTRAINT atomicassets_templates_data_pkey PRIMARY KEY (contract, template_id, "key");

ALTER TABLE ONLY atomicassets_templates
    ADD CONSTRAINT atomicassets_templates_pkey PRIMARY KEY (contract, template_id);

ALTER TABLE ONLY atomicassets_schemas
    ADD CONSTRAINT atomicassets_schemas_pkey PRIMARY KEY (contract, collection_name, schema_name);

ALTER TABLE ONLY atomicassets_token_symbols
    ADD CONSTRAINT atomicassets_token_symbols_pkey PRIMARY KEY (contract, token_symbol);

ALTER TABLE ONLY atomicassets_transfers_assets
    ADD CONSTRAINT atomicassets_transfers_assets_pkey PRIMARY KEY (transfer_id, contract, asset_id);

ALTER TABLE ONLY atomicassets_transfers
    ADD CONSTRAINT atomicassets_transfers_pkey PRIMARY KEY (transfer_id);

-- FOREIGN KEYS --
ALTER TABLE ONLY atomicassets_assets_backed_tokens
    ADD CONSTRAINT atomicassets_assets_backed_tokens_assets_fkey FOREIGN KEY (asset_id, contract) REFERENCES atomicassets_assets(asset_id, contract) MATCH SIMPLE ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE ONLY atomicassets_assets_backed_tokens
    ADD CONSTRAINT atomicassets_assets_backed_tokens_symbol_fkey FOREIGN KEY (token_symbol, contract) REFERENCES atomicassets_token_symbols(token_symbol, contract) MATCH SIMPLE ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE ONLY atomicassets_assets
    ADD CONSTRAINT atomicassets_assets_collections_fkey FOREIGN KEY (contract, collection_name) REFERENCES atomicassets_collections(contract, collection_name) MATCH SIMPLE ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE ONLY atomicassets_assets_data
    ADD CONSTRAINT atomicassets_assets_data_assets_fkey FOREIGN KEY (asset_id, contract) REFERENCES atomicassets_assets(asset_id, contract) MATCH SIMPLE ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE ONLY atomicassets_assets
    ADD CONSTRAINT atomicassets_assets_templates_fkey FOREIGN KEY (template_id, contract) REFERENCES atomicassets_templates(template_id, contract) MATCH SIMPLE ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE ONLY atomicassets_assets
    ADD CONSTRAINT atomicassets_assets_schemas_fkey FOREIGN KEY (collection_name, schema_name, contract) REFERENCES atomicassets_schemas(collection_name, schema_name, contract) MATCH SIMPLE ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE ONLY atomicassets_balances
    ADD CONSTRAINT atomicassets_balances_symbols_fkey FOREIGN KEY (token_symbol, contract) REFERENCES atomicassets_token_symbols(token_symbol, contract) MATCH SIMPLE ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE ONLY atomicassets_offers_assets
    ADD CONSTRAINT atomicassets_offers_assets_assets_fkey FOREIGN KEY (asset_id, contract) REFERENCES atomicassets_assets(asset_id, contract) MATCH SIMPLE ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE ONLY atomicassets_offers_assets
    ADD CONSTRAINT atomicassets_offers_assets_offers_fkey FOREIGN KEY (offer_id, contract) REFERENCES atomicassets_offers(offer_id, contract) MATCH SIMPLE ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE ONLY atomicassets_templates
    ADD CONSTRAINT atomicassets_templates_collections_fkey FOREIGN KEY (collection_name, contract) REFERENCES atomicassets_collections(collection_name, contract) MATCH SIMPLE ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE ONLY atomicassets_templates_data
    ADD CONSTRAINT atomicassets_templates_data_templates_fkey FOREIGN KEY (template_id, contract) REFERENCES atomicassets_templates(template_id, contract) MATCH SIMPLE ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE ONLY atomicassets_templates
    ADD CONSTRAINT atomicassets_templates_schemas_fkey FOREIGN KEY (collection_name, schema_name, contract) REFERENCES atomicassets_schemas(collection_name, schema_name, contract) MATCH SIMPLE ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE ONLY atomicassets_schemas
    ADD CONSTRAINT atomicassets_schemas_collection_fkey FOREIGN KEY (collection_name, contract) REFERENCES atomicassets_collections(collection_name, contract) MATCH SIMPLE ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE ONLY atomicassets_transfers_assets
    ADD CONSTRAINT atomicassets_transfers_assets_assets_fkey FOREIGN KEY (asset_id, contract) REFERENCES atomicassets_assets(asset_id, contract) MATCH SIMPLE ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE ONLY atomicassets_transfers_assets
    ADD CONSTRAINT atomicassets_transfers_assets_transfers_fkey FOREIGN KEY (transfer_id) REFERENCES atomicassets_transfers(transfer_id) MATCH SIMPLE ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

-- INDEXES --
CREATE INDEX atomicassets_assets_contract ON atomicassets_assets USING hash (contract);
CREATE INDEX atomicassets_assets_collection_name ON atomicassets_assets USING btree (collection_name);
CREATE INDEX atomicassets_assets_template_id ON atomicassets_assets USING btree (template_id);
CREATE INDEX atomicassets_assets_schema_name ON atomicassets_assets USING btree (schema_name);
CREATE INDEX atomicassets_assets_owner ON atomicassets_assets USING hash (owner);
CREATE INDEX atomicassets_assets_readable_name ON atomicassets_assets USING btree (readable_name);
CREATE INDEX atomicassets_assets_burned_at_block ON atomicassets_assets USING btree (burned_at_block);
CREATE INDEX atomicassets_assets_updated_at_block ON atomicassets_assets USING btree (updated_at_block);
CREATE INDEX atomicassets_assets_minted_at_block ON atomicassets_assets USING btree (minted_at_block);

CREATE INDEX atomicassets_assets_backed_tokens_contract ON atomicassets_assets_backed_tokens USING hash (contract);
CREATE INDEX atomicassets_assets_backed_tokens_asset_id ON atomicassets_assets_backed_tokens USING btree (asset_id);
CREATE INDEX atomicassets_assets_backed_tokens_token_symbol ON atomicassets_assets_backed_tokens USING hash (token_symbol);
CREATE INDEX atomicassets_assets_backed_tokens_updated_at_block ON atomicassets_assets_backed_tokens USING btree (updated_at_block);

CREATE INDEX atomicassets_assets_data_contract ON atomicassets_assets_data USING hash (contract);
CREATE INDEX atomicassets_assets_data_asset_id ON atomicassets_assets_data USING btree (asset_id);
CREATE INDEX atomicassets_assets_data_asset_key ON atomicassets_assets_data USING hash ("key");
CREATE INDEX atomicassets_assets_data_updated_at_block ON atomicassets_assets_data USING btree (updated_at_block);
CREATE INDEX atomicassets_assets_data_updated_mutable ON atomicassets_assets_data USING btree (mutable);

CREATE INDEX atomicassets_balances_contract ON atomicassets_balances USING hash (contract);
CREATE INDEX atomicassets_balances_owner ON atomicassets_balances USING hash (owner);
CREATE INDEX atomicassets_balances_token_symbol ON atomicassets_balances USING btree (token_symbol);
CREATE INDEX atomicassets_balances_updated_at_block ON atomicassets_balances USING btree (updated_at_block);

CREATE INDEX atomicassets_collections_contract ON atomicassets_collections USING hash (contract);
CREATE INDEX atomicassets_collections_readable_name ON atomicassets_collections USING btree (readable_name);
CREATE INDEX atomicassets_collections_author ON atomicassets_collections USING hash (author);
CREATE INDEX atomicassets_collections_created_at_block ON atomicassets_collections USING btree (created_at_block);

CREATE INDEX atomicassets_logs_contract ON atomicassets_logs USING hash (contract);
CREATE INDEX atomicassets_logs_name ON atomicassets_logs USING btree (name);
CREATE INDEX atomicassets_logs_relation_name ON atomicassets_logs USING btree (relation_name);
CREATE INDEX atomicassets_logs_relation_id ON atomicassets_logs USING btree (relation_id);
CREATE INDEX atomicassets_logs_created_at_block ON atomicassets_logs USING btree (created_at_block);

CREATE INDEX atomicassets_offers_contract ON atomicassets_offers USING hash (contract);
CREATE INDEX atomicassets_offers_sender ON atomicassets_offers USING hash (sender);
CREATE INDEX atomicassets_offers_recipient ON atomicassets_offers USING hash (recipient);
CREATE INDEX atomicassets_offers_state ON atomicassets_offers USING btree (state);
CREATE INDEX atomicassets_offers_updated_at_block ON atomicassets_offers USING btree (updated_at_block);
CREATE INDEX atomicassets_offers_created_at_block ON atomicassets_offers USING btree (created_at_block);

CREATE INDEX atomicassets_offers_assets_contract ON atomicassets_offers_assets USING hash (contract);
CREATE INDEX atomicassets_offers_assets_offer_id ON atomicassets_offers_assets USING btree (offer_id);
CREATE INDEX atomicassets_offers_assets_owner ON atomicassets_offers_assets USING btree (owner);

CREATE INDEX atomicassets_templates_contract ON atomicassets_templates USING hash (contract);
CREATE INDEX atomicassets_templates_collection_name ON atomicassets_templates USING btree (collection_name);
CREATE INDEX atomicassets_templates_schema_name ON atomicassets_templates USING btree (schema_name);
CREATE INDEX atomicassets_templates_readable_name ON atomicassets_templates USING btree (readable_name);
CREATE INDEX atomicassets_templates_created_at_block ON atomicassets_templates USING btree (created_at_block);

CREATE INDEX atomicassets_templates_data_contract ON atomicassets_templates_data USING hash (contract);
CREATE INDEX atomicassets_templates_data_template_id ON atomicassets_templates_data USING btree (template_id);
CREATE INDEX atomicassets_templates_data_key ON atomicassets_templates_data USING btree ("key");

CREATE INDEX atomicassets_schemas_contract ON atomicassets_schemas USING hash (contract);
CREATE INDEX atomicassets_schemas_collection_name ON atomicassets_schemas USING btree (collection_name);
CREATE INDEX atomicassets_schemas_created_at_block ON atomicassets_schemas USING btree (created_at_block);

CREATE INDEX atomicassets_transfers_contract ON atomicassets_transfers USING hash (contract);
CREATE INDEX atomicassets_transfers_sender ON atomicassets_transfers USING hash (sender);
CREATE INDEX atomicassets_transfers_recipient ON atomicassets_transfers USING hash (recipient);
CREATE INDEX atomicassets_transfers_created_at_block ON atomicassets_transfers USING btree (created_at_block);
