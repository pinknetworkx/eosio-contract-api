CREATE INDEX neftydrops_drop_assets_assets_contract ON neftydrops_drops_assets USING btree (state);

CREATE INDEX neftydrops_drops_state ON neftydrops_drops USING btree (state);
