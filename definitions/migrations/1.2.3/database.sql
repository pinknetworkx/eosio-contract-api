ALTER TABLE contract_traces DROP CONSTRAINT IF EXISTS atomicassets_logs_pkey;
ALTER TABLE contract_traces DROP CONSTRAINT IF EXISTS contract_traces_pkey;
ALTER TABLE contract_traces DROP CONSTRAINT IF EXISTS contract_traces_pkey2;
ALTER TABLE contract_traces ADD CONSTRAINT contract_traces_pkey PRIMARY KEY (global_sequence, account);

UPDATE dbinfo SET "value" = '1.2.3' WHERE name = 'version';
