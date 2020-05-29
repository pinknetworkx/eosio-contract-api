CREATE TABLE auth_tokens (
    token bytea NOT NULL,
    account character varying(12) NOT NULL,
    signature character varying(255) NOT NULL,
    created bigint NOT NULL,
    expire bigint NOT NULL
);

ALTER TABLE ONLY auth_tokens ADD CONSTRAINT auth_tokens_pkey PRIMARY KEY (token);

CREATE INDEX auth_tokens_signature ON auth_tokens USING btree (signature);
CREATE INDEX auth_tokens_account ON auth_tokens USING btree (account);
