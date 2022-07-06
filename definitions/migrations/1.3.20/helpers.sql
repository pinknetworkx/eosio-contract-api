ALTER TABLE helpers_collection_list
ALTER COLUMN collection_name TYPE VARCHAR(13);

TRUNCATE TABLE helpers_collection_list;
