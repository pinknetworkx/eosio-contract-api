SELECT brin_summarize_new_values('atomicassets_mints_idx_asset_id'::regclass);

ALTER INDEX atomicassets_mints_idx_asset_id set (autosummarize = on);

ALTER TABLE atomicassets_templates SET (fillfactor = 90);
