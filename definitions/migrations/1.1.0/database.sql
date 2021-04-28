DROP INDEX IF EXISTS contract_abis_block_time;
DROP INDEX IF EXISTS contract_codes_block_time;

DROP INDEX IF EXISTS contract_traces_created_at_block;

UPDATE dbinfo SET "value" = '1.1.0' WHERE name = 'version';
