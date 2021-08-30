ALTER TABLE neftydrops_claims ADD COLUMN IF NOT EXISTS amount_spent bigint;
ALTER TABLE neftydrops_claims ADD COLUMN IF NOT EXISTS spent_symbol character varying(12);
ALTER TABLE neftydrops_claims ADD COLUMN IF NOT EXISTS core_amount bigint;
ALTER TABLE neftydrops_claims ADD COLUMN IF NOT EXISTS core_symbol character varying(12);

CREATE INDEX neftydrops_claims_amount_spent ON neftydrops_claims USING btree (amount_spent);
CREATE INDEX neftydrops_claims_core_amount ON neftydrops_claims USING btree (core_amount);

CREATE INDEX neftydrops_claims_spent_symbol ON neftydrops_claims USING btree (spent_symbol);
CREATE INDEX neftydrops_claims_core_symbol ON neftydrops_claims USING btree (core_symbol);
