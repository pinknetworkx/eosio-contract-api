ALTER TABLE neftyblends_blend_ingredients DROP CONSTRAINT IF EXISTS neftyblends_blend_ingredients_blend_fkey CASCADE;

DROP TABLE IF EXISTS neftyblends_blend_ingredient_typed_attributes;
CREATE TABLE neftyblends_blend_ingredient_typed_attributes
(
    contract                   character varying(12) NOT NULL,
    blend_id                   bigint                NOT NULL,
    ingredient_collection_name character varying(13) NOT NULL,
    ingredient_index           integer               NOT NULL,
    typed_attribute_index      integer               NOT NULL,

    attribute_name             text                  NOT NULL,
    attribute_type             text                  NOT NULL,
    allowed_values_type        text                  NOT NULL,
    allowed_values             jsonb                 NOT NULL,

    CONSTRAINT neftyblends_blend_ingredient_typed_attributes_pkey PRIMARY KEY (contract, blend_id, ingredient_index, typed_attribute_index)
);

DROP TABLE IF EXISTS neftyblends_blend_upgrade_specs;
CREATE TABLE neftyblends_blend_upgrade_specs
(
    contract                character varying(12)  NOT NULL,
    blend_id                bigint                 NOT NULL,
    upgrade_spec_index      bigint                 NOT NULL,

    schema_name             character varying(12)  NOT NULL,
    display_data            text                   NOT NULL,

    CONSTRAINT neftyblends_blend_upgrade_specs_pkey PRIMARY KEY (
        contract, blend_id, upgrade_spec_index
    )
);

DROP TABLE IF EXISTS neftyblends_blend_upgrade_spec_upgrade_requirements;
CREATE TABLE neftyblends_blend_upgrade_spec_upgrade_requirements
(
    contract                      character varying(12)  NOT NULL,
    blend_id                      bigint                 NOT NULL,
    upgrade_spec_index            bigint                 NOT NULL,
    upgrade_requirement_index     bigint                 NOT NULL,

    -- either of two values: 'TEMPLATE_REQUIREMENT' or 'TYPED_ATTRIBUTE_REQUIREMENT'
    type                          character varying(50)  NOT NULL,

    -- NULL if type != 'TEMPLATE_REQUIREMENT'
    template_id                   bigint                 NULL,

    -- NULL if type != 'TYPED_ATTRIBUTE_REQUIREMENT'
    typed_attribute_definition     jsonb                  NULL,

    CONSTRAINT neftyblends_blend_upgrade_spec_upgrade_requirements_pkey PRIMARY KEY (
        contract, blend_id, upgrade_spec_index, upgrade_requirement_index
    )
);

DROP TABLE IF EXISTS neftyblends_blend_upgrade_spec_upgrade_results;
CREATE TABLE neftyblends_blend_upgrade_spec_upgrade_results
(
    contract                      character varying(12)  NOT NULL,
    blend_id                      bigint                 NOT NULL,
    upgrade_spec_index            bigint                 NOT NULL,
    upgrade_result_index          bigint                 NOT NULL,

    attribute_name                text                   NOT NULL,
    attribute_type                text                   NOT NULL,
    upgrade_operator              jsonb                  NOT NULL,

    -- used in foreign key with neftyblends_valuerolls
    blend_collection_name         character varying(12)  NOT NULL,

    -- One of 2 values: 'ROLL_VALUE', 'IMMEDIATE_VALUE',
    result_value_type             character varying(50)  NOT NULL,
    -- null if result_value_type != 'IMMEDIATE_VALUE'
    -- else one of 2 values:  'uint64', 'string'
    immediate_type                character varying(50)  NULL,

    -- null if result_value_type != 'VALUE_ROLL_RESULT'
    valueroll_id                  character varying(12)  NULL,
    -- null if result_value_type != 'IMMEDIATE_VALUE' OR immediate_type != 'string'
    immediate_string              text                   NULL,
    -- null if result_value_type != 'IMMEDIATE_VALUE' OR immediate_type != 'uint64'
    immediate_uint64              bigint                 NULL,

    CONSTRAINT neftyblends_blend_upgrade_spec_upgrade_results_pkey PRIMARY KEY (
        contract, blend_id, upgrade_spec_index, upgrade_result_index
    )
);

DROP TABLE IF EXISTS neftyblends_valuerolls;
CREATE TABLE neftyblends_valuerolls
(
    contract                      character varying(12)  NOT NULL,
    collection_name               character varying(12)  NOT NULL,
    valueroll_id                  character varying(12)  NOT NULL,

    value_outcomes                jsonb                  NOT NULL,
    total_odds                    bigint                 NOT NULL,

    updated_at_block              bigint                 NOT NULL,
    updated_at_time               bigint                 NOT NULL,
    created_at_block              bigint                 NOT NULL,
    created_at_time               bigint                 NOT NULL,

    CONSTRAINT neftyblends_valuerolls_pkey PRIMARY KEY (contract, collection_name, valueroll_id)
);

ALTER TABLE ONLY neftyblends_blend_upgrade_specs
    ADD CONSTRAINT blend_upgrade_specs_blend_fkey
    FOREIGN KEY (
        contract, blend_id
    ) REFERENCES neftyblends_blends (
        contract, blend_id
    ) MATCH SIMPLE ON
        UPDATE RESTRICT
        ON
            DELETE
            RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE ONLY neftyblends_blend_upgrade_spec_upgrade_requirements
    ADD CONSTRAINT blend_upgrade_spec_upgrade_requirements_upgrade_specs_fkey
    FOREIGN KEY (
        contract, blend_id, upgrade_spec_index
    ) REFERENCES neftyblends_blend_upgrade_specs (
        contract, blend_id, upgrade_spec_index
    ) MATCH SIMPLE ON
        UPDATE RESTRICT
        ON
            DELETE
            RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE ONLY neftyblends_blend_upgrade_spec_upgrade_results
    ADD CONSTRAINT blend_upgrade_spec_upgrade_results_blend_upgrade_specs_fkey
    FOREIGN KEY (
        contract, blend_id, upgrade_spec_index
    ) REFERENCES neftyblends_blend_upgrade_specs (
        contract, blend_id, upgrade_spec_index
    ) MATCH SIMPLE ON
        UPDATE RESTRICT
        ON
            DELETE
            RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE ONLY neftyblends_blend_upgrade_spec_upgrade_results
    ADD CONSTRAINT blend_upgrade_spec_upgrade_results_valuerolls_fkey
    FOREIGN KEY (
        contract, blend_collection_name, valueroll_id
    ) REFERENCES neftyblends_valuerolls (
        contract, collection_name, valueroll_id
    ) MATCH SIMPLE ON
        UPDATE RESTRICT
        ON
            DELETE
            RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE ONLY neftyblends_blend_ingredient_typed_attributes
    ADD CONSTRAINT neftyblends_blend_ingredient_typed_attr_blend_ingredient_fkey
    FOREIGN KEY (
        contract, blend_id, ingredient_index)
    REFERENCES neftyblends_blend_ingredients (
        contract, blend_id, ingredient_index
    ) MATCH SIMPLE ON
        UPDATE RESTRICT
        ON
            DELETE
            RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;



