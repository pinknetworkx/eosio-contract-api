

ALTER TABLE contract_traces SET (autovacuum_vacuum_insert_scale_factor = 0.0);
ALTER TABLE contract_traces SET (autovacuum_vacuum_insert_threshold = 1000000);


UPDATE dbinfo SET "value" = '1.3.12' WHERE name = 'version';
