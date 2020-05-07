CREATE TABLE contract_abis (
    account bigint NOT NULL,
    abi bytea NOT NULL,
    block_num bigint NOT NULL,
    block_time bigint NOT NULL
);

CREATE TABLE contract_codes (
    account bigint NOT NULL,
    block_num bigint NOT NULL,
    block_time bigint NOT NULL
);

CREATE TABLE contract_readers (
    name character varying(64) NOT NULL,
    block_num bigint NOT NULL,
    block_time bigint NOT NULL,
    updated bigint NOT NULL
);

CREATE TABLE reversible_queries
(
    id integer NOT NULL DEFAULT nextval('reversible_queries_id_seq'::regclass),
    "table" character varying(64) NOT NULL,
    "values" text COLLATE pg_catalog."default" NOT NULL,
    condition text COLLATE pg_catalog."default" NOT NULL,
    block_num bigint NOT NULL
);

ALTER TABLE ONLY contract_abis ADD CONSTRAINT contract_abis_pkey PRIMARY KEY (account, block_num);
ALTER TABLE ONLY contract_codes ADD CONSTRAINT contract_codes_pkey PRIMARY KEY (account, block_num);
ALTER TABLE ONLY contract_readers ADD CONSTRAINT contract_readers_pkey PRIMARY KEY (name);
ALTER TABLE ONLY reversible_queries ADD CONSTRAINT reversible_queries_pkey PRIMARY KEY (id);

CREATE INDEX contract_abis_account ON contract_abis USING btree (account);
CREATE INDEX contract_abis_block_num ON contract_abis USING btree (block_num);
CREATE INDEX contract_abis_block_time ON contract_abis USING btree (block_time);
CREATE INDEX contract_codes_account ON contract_codes USING btree (account);
CREATE INDEX contract_codes_block_num ON contract_codes USING btree (block_num);
CREATE INDEX contract_codes_block_time ON contract_codes USING btree (block_time);
CREATE INDEX reversible_queries_block_num ON reversible_queries USING btree (block_num);
