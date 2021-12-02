CREATE INDEX neftydrops_drop_assets_assets_contract ON neftydrops_drop_assets USING btree (assets_contract);

CREATE INDEX neftydrops_drops_state ON neftydrops_drops USING btree (state);
