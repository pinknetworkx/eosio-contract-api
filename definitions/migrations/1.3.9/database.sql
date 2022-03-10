/*
run manually before migration to make it faster:

create index CONCURRENTLY contract_traces_idx_global_sequence on contract_traces using brin (global_sequence);
create index CONCURRENTLY contract_traces_idx_created_at_time on contract_traces using brin (created_at_time);

ANALYSE contract_traces;

*/


create index if not exists contract_traces_idx_global_sequence on contract_traces using brin (global_sequence);
create index if not exists contract_traces_idx_created_at_time on contract_traces using brin (created_at_time);

alter table contract_traces drop constraint contract_traces_pkey; -- 24GB, replaced by brin (losing uniqueness)
drop index if exists contract_traces_created_at_time; -- 5.6GB, replaced by brin

ANALYSE contract_traces;

UPDATE dbinfo SET "value" = '1.3.9' WHERE name = 'version';
