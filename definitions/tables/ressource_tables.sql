CREATE TABLE ressource_balances (
    account character varying(12) NOT NULL,
    net bigint,
    net_by_others bigint,
    cpu bigint,
    cpu_by_others bigint,
    ram bigint,
    created_at_time bigint NOT NULL,
    created_at_block bigint NOT NULL,
    CONSTRAINT ressource_balances_pkey PRIMARY KEY (account)
);

CREATE TABLE ressource_rammarket (
    block_num bigint NOT NULL,
    block_time bigint NOT NULL,
    base_balance bigint NOT NULL,
    base_weight double precision NOT NULL,
    base_precision integer NOT NULL,
    quote_balance bigint NOT NULL,
    quote_weight double precision NOT NULL,
    quote_precision integer NOT NULL,
    CONSTRAINT ressource_rammarket_pkey PRIMARY KEY (block_num)
);

CREATE TABLE ressource_deltas (
    block_num bigint NOT NULL,
    block_time bigint NOT NULL,
    net bigint NOT NULL,
    cpu bigint NOT NULL,
    ram bigint NOT NULL,
    CONSTRAINT ressource_deltas_pkey PRIMARY KEY (block_num)
);


CREATE INDEX ressource_balances_net ON ressource_balances USING btree (net);
CREATE INDEX ressource_balances_cpu ON ressource_balances USING btree (cpu);
CREATE INDEX ressource_balances_ram ON ressource_balances USING btree (ram);
CREATE INDEX ressource_balances_created_at_time ON ressource_balances USING btree (created_at_time);
CREATE INDEX ressource_balances_created_at_block ON ressource_balances USING btree (created_at_block);

CREATE INDEX ressource_rammarket_base_balance ON ressource_rammarket USING btree (base_balance);
CREATE INDEX ressource_rammarket_quote_balance ON ressource_rammarket USING btree (quote_balance);

CREATE INDEX ressource_deltas_net ON ressource_deltas USING btree (net);
CREATE INDEX ressource_deltas_cpu ON ressource_deltas USING btree (cpu);
CREATE INDEX ressource_deltas_ram ON ressource_deltas USING btree (ram);
