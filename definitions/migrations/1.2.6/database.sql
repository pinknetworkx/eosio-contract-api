DROP INDEX IF EXISTS contract_traces_account;
DROP INDEX IF EXISTS contract_traces_name;
DROP INDEX IF EXISTS contract_traces_created_at_block;

DROP INDEX IF EXISTS reversible_queries_reader;

UPDATE dbinfo SET "value" = '1.2.6' WHERE name = 'version';
