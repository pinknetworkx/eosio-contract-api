CREATE TABLE neftydrops_account_stats
(
    claimer                character varying(12) NOT NULL,
    drop_id                bigint                NOT NULL,
    use_counter            bigint                NOT NULL,
    last_claim_time        bigint                NOT NULL,
    used_nonces            text                  NOT NULL,

    CONSTRAINT neftydrops_account_stats_pkey PRIMARY KEY (claimer, drop_id)
);

CREATE TABLE neftydrops_accounts_whitelist
(
    drop_id                bigint                NOT NULL,
    account                character varying(12) NOT NULL,
    account_limit          smallint              NOT NULL,

    CONSTRAINT neftydrops_accounts_whitelist_pkey PRIMARY KEY (drop_id, account)
);

CREATE TABLE neftydrops_authkeys
(
    drop_id                bigint                 NOT NULL,
    public_key             character varying(200) NOT NULL,
    key_limit              bigint                NOT NULL,
    key_limit_cooldown     bigint                NOT NULL,
    use_counter            bigint                NOT NULL,
    last_claim_time        bigint                NOT NULL,

    CONSTRAINT neftydrops_authkeys_pkey PRIMARY KEY (drop_id, public_key)
);

CREATE TABLE neftydrops_proof_of_ownership
(
    drop_id                bigint                NOT NULL,
    logical_operator       smallint              NOT NULL,
    filters                jsonb,

    CONSTRAINT neftydrops_proof_of_ownership_pkey PRIMARY KEY (drop_id)
);



-- Indexes
CREATE
    INDEX neftydrops_account_stats_claimer ON neftydrops_account_stats USING btree (claimer);
CREATE
    INDEX neftydrops_account_stats_drop_id ON neftydrops_account_stats USING btree (drop_id);
CREATE
    INDEX neftydrops_accounts_whitelist_drop_id ON neftydrops_accounts_whitelist USING btree (drop_id);
CREATE
    INDEX neftydrops_accounts_whitelist_account ON neftydrops_accounts_whitelist USING btree (account);
CREATE
    INDEX neftydrops_authkeys_drop_id ON neftydrops_authkeys USING btree (drop_id);
CREATE
    INDEX neftydrops_authkeys_public_key ON neftydrops_authkeys USING btree (public_key);
CREATE
    INDEX neftydrops_proof_of_ownership_drop_id ON neftydrops_proof_of_ownership USING btree (drop_id);