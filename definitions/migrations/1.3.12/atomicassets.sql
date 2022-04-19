
select brin_summarize_new_values('atomicassets_mints_idx_asset_id'::regclass);


ALTER TABLE atomicassets_mints SET (autovacuum_vacuum_scale_factor = 0.0);
ALTER TABLE atomicassets_mints SET (autovacuum_vacuum_threshold = 100000);
ALTER TABLE atomicassets_mints SET (autovacuum_analyze_scale_factor = 0.0);
ALTER TABLE atomicassets_mints SET (autovacuum_analyze_threshold = 1000000);
ALTER TABLE atomicassets_mints SET (autovacuum_vacuum_insert_scale_factor = 0.0);
ALTER TABLE atomicassets_mints SET (autovacuum_vacuum_insert_threshold = 1000000);

alter index atomicassets_mints_idx_asset_id set (autosummarize = on);

ALTER TABLE atomicassets_templates SET (fillfactor = 90);
