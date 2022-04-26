select brin_summarize_new_values('contract_traces_idx_global_sequence'::regclass);
select brin_summarize_new_values('contract_traces_idx_created_at_time'::regclass);


ALTER TABLE contract_traces SET (autovacuum_vacuum_scale_factor = 0.0);
ALTER TABLE contract_traces SET (autovacuum_vacuum_threshold = 100000);
ALTER TABLE contract_traces SET (autovacuum_analyze_scale_factor = 0.0);
ALTER TABLE contract_traces SET (autovacuum_analyze_threshold = 1000000);

alter index contract_traces_idx_global_sequence set (autosummarize = on);
alter index contract_traces_idx_created_at_time set (autosummarize = on);

UPDATE dbinfo SET "value" = '1.3.15' WHERE name = 'version';
