CREATE TABLE helpers_collection_list
(
    assets_contract        character varying(12) NOT NULL,
    collection_name        character varying(12) NOT NULL,
    contract               character varying(12) NOT NULL,
    list                   character varying(12) NOT NULL,
    updated_at_block       bigint                NOT NULL,
    updated_at_time        bigint                NOT NULL,
    CONSTRAINT helpers_collection_list_pkey PRIMARY KEY (assets_contract, collection_name, contract, list)
);

-- Indexes
CREATE
    INDEX helpers_list_collection_name ON helpers_collection_list USING btree(collection_name);
CREATE
    INDEX helpers_list_assets_contract_collection_name ON helpers_collection_list USING btree(assets_contract, collection_name);
CREATE
    INDEX helpers_list_assets_contract_collection_name_list ON helpers_collection_list USING btree(assets_contract, collection_name, list);
CREATE
    INDEX helpers_list_assets_contract_list_provider ON helpers_collection_list USING btree(assets_contract, list, contract);
