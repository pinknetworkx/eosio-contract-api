/*
run manually before migration to make it faster:

create index CONCURRENTLY atomicassets_mints_idx_asset_id on atomicassets_mints using brin (asset_id);

ANALYSE atomicassets_mints;

*/


create index atomicassets_mints_idx_asset_id on atomicassets_mints using brin (asset_id);

DROP INDEX atomicassets_mints_minter; -- 1GB, used as filter in conjunction with asset_id, which is a better index
DROP INDEX atomicassets_mints_receiver; -- 1.6GB, never used as filter

DROP INDEX atomicassets_mints_asset_id; -- 2.8GB, replaced by brin
alter table atomicassets_mints drop constraint atomicassets_mints_pkey; -- 2.3GB, replaced by brin (losing uniqueness)

DROP INDEX atomicassets_assets_burned_at_time; -- 1.7GB, never used as filter



ANALYSE atomicassets_mints;
