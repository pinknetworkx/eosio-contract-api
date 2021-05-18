CREATE TABLE simpleassets_assets (
    contract character varying(12) NOT NULL,
    asset_id bigint NOT NULL,
    author character varying(12) NOT NULL,
    category character varying(12) NOT NULL,
    owner character varying(12),
    mutable_data jsonb,
    immutable_data jsonb,
    burned_by_account character varying(12),
    burned_at_block bigint,
    burned_at_time bigint,
    transferred_at_block bigint NOT NULL,
    transferred_at_time bigint NOT NULL,
    updated_at_block bigint NOT NULL,
    updated_at_time bigint NOT NULL,
    minted_at_block bigint NOT NULL,
    minted_at_time bigint NOT NULL,
    CONSTRAINT simpleassets_assets_pkey PRIMARY KEY (contract, asset_id)
);

CREATE TABLE simpleassets_authors (
    contract character varying(12) NOT NULL,
    author character varying(12) NOT NULL,
    dappinfo jsonb,
    fieldtypes jsonb,
    priorityimg jsonb,
    CONSTRAINT simpleassets_collections_pkey PRIMARY KEY (contract, author)
);

CREATE TABLE simpleassets_transfers (
    transfer_id bigint NOT NULL,
    contract character varying(12) NOT NULL,
    "sender" character varying(12) NOT NULL,
    "recipient" character varying(12) NOT NULL,
    memo character varying(256) NOT NULL,
    txid bytea NOT NULL,
    created_at_block bigint NOT NULL,
    created_at_time bigint NOT NULL,
    CONSTRAINT simpleassets_transfers_pkey PRIMARY KEY (contract, transfer_id)
);

CREATE TABLE simpleassets_transfers_assets (
    transfer_id bigint NOT NULL,
    contract character varying(12) NOT NULL,
    "index" integer NOT NULL,
    asset_id bigint NOT NULL,
    CONSTRAINT simpleassets_transfers_assets_pkey PRIMARY KEY (transfer_id, contract, asset_id)
);

CREATE TABLE simpleassets_config (
    contract character varying(12) NOT NULL,
    version character varying(64) NOT NULL,
    CONSTRAINT simpleassets_config_pkey PRIMARY KEY (contract)
);


-- FOREIGN KEYS --
ALTER TABLE ONLY simpleassets_transfers_assets
    ADD CONSTRAINT simpleassets_transfers_assets_transfers_fkey FOREIGN KEY (contract, transfer_id) REFERENCES simpleassets_transfers(contract, transfer_id) MATCH SIMPLE ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

-- INDEXES --
CREATE INDEX simpleassets_assets_asset_id ON simpleassets_assets USING btree (asset_id);
CREATE INDEX simpleassets_assets_author_btree ON simpleassets_assets USING btree (author);
CREATE INDEX simpleassets_assets_categpry ON simpleassets_assets USING btree (category);
CREATE INDEX simpleassets_assets_owner ON simpleassets_assets USING btree (owner);
CREATE INDEX simpleassets_assets_burned_by_account ON simpleassets_assets USING btree (burned_by_account);
CREATE INDEX simpleassets_assets_burned_at_time ON simpleassets_assets USING btree (burned_at_time);
CREATE INDEX simpleassets_assets_updated_at_time ON simpleassets_assets USING btree (updated_at_time);
CREATE INDEX simpleassets_assets_transferred_at_time ON simpleassets_assets USING btree (transferred_at_time);
CREATE INDEX simpleassets_assets_minted_at_time ON simpleassets_assets USING btree (minted_at_time);
CREATE INDEX simpleassets_assets_mutable_data_gin ON simpleassets_assets USING gin (mutable_data);
CREATE INDEX simpleassets_assets_immutable_data_gin ON simpleassets_assets USING gin (immutable_data);

CREATE INDEX simpleassets_transfers_sender ON simpleassets_transfers USING btree (sender);
CREATE INDEX simpleassets_transfers_recipient ON simpleassets_transfers USING btree (recipient);
CREATE INDEX simpleassets_transfers_created_at_time ON simpleassets_transfers USING btree (created_at_time);

CREATE INDEX simpleassets_transfers_assets_asset_id ON simpleassets_transfers_assets USING btree (asset_id);
