
SELECT brin_summarize_new_values('contract_traces_idx_global_sequence'::regclass);
SELECT brin_summarize_new_values('contract_traces_idx_created_at_time'::regclass);

ALTER INDEX contract_traces_idx_global_sequence set (autosummarize = on);
ALTER INDEX contract_traces_idx_created_at_time set (autosummarize = on);

UPDATE dbinfo SET "value" = '1.3.11' WHERE name = 'version';
