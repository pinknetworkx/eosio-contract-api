
select brin_summarize_new_values('contract_traces_idx_global_sequence'::regclass);
select brin_summarize_new_values('contract_traces_idx_created_at_time'::regclass);


alter index contract_traces_idx_global_sequence set (autosummarize = on);
alter index contract_traces_idx_created_at_time set (autosummarize = on);

UPDATE dbinfo SET "value" = '1.3.11' WHERE name = 'version';
