CREATE TABLE contract_abis (
    account character varying(12) NOT NULL,
    abi bytea NOT NULL,
    block_num bigint NOT NULL,
    block_time bigint NOT NULL,
    CONSTRAINT contract_abis_pkey PRIMARY KEY (account, block_num)
);

CREATE TABLE contract_codes (
    account character varying(12) NOT NULL,
    block_num bigint NOT NULL,
    block_time bigint NOT NULL,
    CONSTRAINT contract_codes_pkey PRIMARY KEY (account, block_num)
);

CREATE TABLE contract_readers (
    name character varying(64) NOT NULL,
    block_num bigint NOT NULL,
    block_time bigint NOT NULL,
    updated bigint NOT NULL,
    CONSTRAINT contract_readers_pkey PRIMARY KEY (name)
);

CREATE TABLE dbinfo (
    "name" character varying(64) NOT NULL,
    "value" text NOT NULL,
    updated bigint NOT NULL,
    CONSTRAINT dbinfo_pkey PRIMARY KEY (name)
);
INSERT INTO dbinfo ("name", "value", updated) VALUES ('version', '1.0.0', extract(epoch from current_timestamp)::bigint);

CREATE SEQUENCE reversible_queries_id_seq;
CREATE TABLE reversible_queries
(
    id integer NOT NULL DEFAULT nextval('reversible_queries_id_seq'::regclass),
    reader character varying(64) NOT NULL,
    operation character varying(64) NOT NULL,
    "table" character varying(64) NOT NULL,
    "values" json NOT NULL,
    condition json NOT NULL,
    block_num bigint NOT NULL,
    CONSTRAINT reversible_queries_pkey PRIMARY KEY (id)
);

CREATE TABLE reversible_blocks
(
    reader character varying(64) NOT NULL,
    block_id bytea NOT NULL,
    block_num bigint NOT NULL,
    CONSTRAINT reversible_blocks_pkey PRIMARY KEY (reader, block_num)
);

CREATE INDEX contract_abis_account ON contract_abis USING hash (account);
CREATE INDEX contract_abis_block_num ON contract_abis USING btree (block_num);
CREATE INDEX contract_abis_block_time ON contract_abis USING btree (block_time);
CREATE INDEX contract_codes_account ON contract_codes USING hash (account);
CREATE INDEX contract_codes_block_num ON contract_codes USING btree (block_num);
CREATE INDEX contract_codes_block_time ON contract_codes USING btree (block_time);
CREATE INDEX reversible_queries_block_num ON reversible_queries USING btree (block_num);
CREATE INDEX reversible_queries_reader ON reversible_queries USING hash (reader);
