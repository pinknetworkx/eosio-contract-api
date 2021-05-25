ALTER TABLE atomicassets_transfers DROP CONSTRAINT IF EXISTS atomicassets_transfers_assets_transfers_fkey;

ALTER TABLE atomicassets_transfers DROP CONSTRAINT IF EXISTS atomicassets_transfers_pkey;
ALTER TABLE atomicassets_transfers ADD CONSTRAINT contract_traces_pkey PRIMARY KEY (contract, transfer_id);

ALTER TABLE atomicassets_transfers_assets DROP CONSTRAINT IF EXISTS atomicassets_transfers_assets_pkey;
ALTER TABLE atomicassets_transfers_assets ADD CONSTRAINT atomicassets_transfers_assets_pkey PRIMARY KEY (transfer_id, contract, asset_id);

ALTER TABLE ONLY atomicassets_transfers_assets
    ADD CONSTRAINT atomicassets_transfers_assets_transfers_fkey FOREIGN KEY (contract, transfer_id) REFERENCES atomicassets_transfers(contract, transfer_id) MATCH SIMPLE ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;
