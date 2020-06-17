CREATE TABLE wax_gbm_balances (
    account character varying(12) NOT NULL,
    balance bigint NOT NULL,
    unclaimed bigint NOT NULL,
    last_claim bigint NOT NULL,
    last_updated bigint NOT NULL,
    CONSTRAINT wax_gbm_balances_pkey PRIMARY KEY (account)
);

CREATE TABLE wax_gbm_deltas (
    block_num bigint NOT NULL,
    block_time bigint NOT NULL,
    gbm bigint NOT NULL,
    CONSTRAINT wax_gbm_deltas_pkey PRIMARY KEY (block_num)
);

CREATE INDEX wax_gbm_balances_balance ON wax_gbm_balances USING btree (balance);
CREATE INDEX wax_gbm_balances_last_claim ON wax_gbm_balances USING btree (last_claim);
CREATE INDEX wax_gbm_balances_last_updated ON wax_gbm_balances USING btree (last_updated);

CREATE INDEX wax_gbm_deltas_block_time ON wax_gbm_deltas USING btree (block_time);
CREATE INDEX wax_gbm_deltas_gbm ON wax_gbm_deltas USING btree (gbm);
