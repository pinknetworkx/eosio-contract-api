CREATE TABLE token_stats (
    contract character varying(12) NOT NULL,
    token_symbol character varying(12) NOT NULL,
    token_precision integer NOT NULL,
    max_supply bigint NOT NULL,
    supply bigint NOT NULL,
    CONSTRAINT token_stats_pkey PRIMARY KEY (contract, token_symbol)
);

CREATE TABLE token_supply_deltas (
    contract character varying(12) NOT NULL,
    token_symbol character varying(12) NOT NULL,
    amount bigint NOT NULL,
    created_at_block bigint NOT NULL,
    created_at_time bigint NOT NULL,
    CONSTRAINT token_supply_deltas_pkey PRIMARY KEY (contract, token_symbol)
);

CREATE TABLE token_transfers (
    contract character varying(12) NOT NULL,
    transfer_id bigint NOT NULL,
    "from" character varying(12) NOT NULL,
    "to" character varying(12) NOT NULL,
    amount bigint NOT NULL,
    token_symbol character varying(12) NOT NULL,
    memo character varying(256) NOT NULL,
    txid bytea NOT NULL,
    created_at_block bigint NOT NULL,
    created_at_time bigint NOT NULL,
    CONSTRAINT token_transfers_pkey PRIMARY KEY (contract, transfer_id)
);

CREATE TABLE token_balances (
    contract character varying(12) NOT NULL,
    token_symbol character varying(12) NOT NULL,
    account character varying(12) NOT NULL,
    amount bigint NOT NULL,
    updated_at_block bigint NOT NULL,
    updated_at_time bigint NOT NULL,
    CONSTRAINT token_balances_pkey PRIMARY KEY (contract, token_symbol, account)
);

ALTER TABLE ONLY token_supply
    ADD CONSTRAINT token_supply_symbol_fkey FOREIGN KEY (contract, token_symbol)
    REFERENCES token_stats (contract, token_symbol) MATCH SIMPLE ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE ONLY token_transfers
    ADD CONSTRAINT token_transfers_symbol_fkey FOREIGN KEY (contract, token_symbol)
    REFERENCES token_stats (contract, token_symbol) MATCH SIMPLE ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE ONLY token_balances
    ADD CONSTRAINT token_balances_symbol_fkey FOREIGN KEY (contract, token_symbol)
    REFERENCES token_stats (contract, token_symbol) MATCH SIMPLE ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

CREATE INDEX token_stats_contract ON token_stats USING hash (contract);
CREATE INDEX token_stats_supply ON token_stats USING btree (supply);

CREATE INDEX token_supply_deltas_contract ON token_supply_deltas USING hash (contract);
CREATE INDEX token_supply_deltas_amount ON token_supply_deltas USING btree (amount);
CREATE INDEX token_supply_deltas_created_at_time ON token_supply_deltas USING btree (created_at_time);

CREATE INDEX token_transfers_contract ON token_transfers USING hash (contract);
CREATE INDEX token_transfers_from ON token_transfers USING hash ("from");
CREATE INDEX token_transfers_to ON token_transfers USING hash ("to");
CREATE INDEX token_transfers_amount ON token_transfers USING btree (amount);
CREATE INDEX token_transfers_txid ON token_transfers USING hash (txid);
CREATE INDEX token_transfers_created_at_time ON token_transfers USING btree (created_at_time);
CREATE INDEX token_transfers_created_at_block ON token_transfers USING btree (created_at_block);

CREATE INDEX token_balances_contract ON token_balances USING hash (contract);
CREATE INDEX token_balances_account ON token_balances USING hash (account);
CREATE INDEX token_balances_amount ON token_balances USING btree (amount);
CREATE INDEX token_balances_updated_at_block ON token_balances USING btree (updated_at_block);
CREATE INDEX token_balances_updated_at_time ON token_balances USING btree (updated_at_time);
