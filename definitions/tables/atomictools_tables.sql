CREATE TABLE atomictools_config (
    tools_contract character varying(12) NOT NULL,
    version character varying(64) NOT NULL,
    asset_contract character varying(12) NOT NULL,
    CONSTRAINT atomictools_config_pkey PRIMARY KEY (contract)
);

CREATE TABLE atomictools_links (
    tools_contract character varying(12) NOT NULL,
    link_id bigint NOT NULL,
    asset_contract character varying(12) NOT NULL,
    creator character varying(64) NOT NULL,
    claimer character varying(64),
    state integer NOT NULL,
    key_type integer NOT NULL,
    key_data bytea NOT NULL,
    txid bytea,
    created_at_block bigint NOT NULL,
    created_at_time bigint NOT NULL,
    CONSTRAINT atomictools_links_pkey PRIMARY KEY (contract, link_id)
);

CREATE TABLE atomictools_links_assets (
    tools_contract character varying(12) NOT NULL,
    link_id bigint NOT NULL,
    asset_contract character varying(12) NOT NULL,
    asset_id character varying(12) NOT NULL,
    CONSTRAINT atomictools_links_assets_pkey PRIMARY KEY (tools_contract, link_id, asset_contract, asset_id)
);

ALTER TABLE ONLY atomictools_links_assets
    ADD CONSTRAINT atomictools_links_assets_asset_id_fkey FOREIGN KEY (asset_contract, asset_id)
    REFERENCES atomicassets_assets (contract, asset_id) MATCH SIMPLE ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE ONLY atomictools_links_assets
    ADD CONSTRAINT atomictools_links_assets_link_id_fkey FOREIGN KEY (tools_contract, link_id)
    REFERENCES atomictools_links (tools_contract, link_id) MATCH SIMPLE ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

CREATE INDEX atomictools_links_tools_contract ON atomictools_links USING hash (tools_contract);
CREATE INDEX atomictools_links_state ON atomictools_links USING hash (state);
CREATE INDEX atomictools_links_creator ON atomictools_links USING hash (creator);
CREATE INDEX atomictools_links_key_type ON atomictools_links USING hash (key_type);
CREATE INDEX atomictools_links_key_data ON atomictools_links USING hash (key_data);
CREATE INDEX atomictools_links_txid ON atomictools_links USING hash (txid);
CREATE INDEX atomictools_links_created_at_block ON atomictools_links USING btree (created_at_block);
CREATE INDEX atomictools_links_created_at_time ON atomictools_links USING btree (created_at_time);

CREATE INDEX atomictools_links_assets_tools_contract ON atomictools_links_assets USING hash (tools_contract);
CREATE INDEX atomictools_links_assets_asset_contract ON atomictools_links_assets USING hash (asset_contract);
