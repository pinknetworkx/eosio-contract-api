CREATE TABLE auth_tokens
(
    "token" bytea NOT NULL,
    account character varying(12) COLLATE pg_catalog."default" NOT NULL,
    nonce bytea NOT NULL,
    created bigint NOT NULL,
    expire bigint NOT NULL,
    CONSTRAINT auth_tokens_pkey PRIMARY KEY ("token"),
    CONSTRAINT auth_tokens_nonce UNIQUE (nonce)
);

CREATE INDEX auth_tokens_account ON auth_tokens USING btree (account);
