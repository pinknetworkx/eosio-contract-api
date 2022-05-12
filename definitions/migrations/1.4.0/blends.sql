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
    ADD CONSTRAINT neftyblends_blend_ingredient_typed_attributes_blend_ingredient_fkey
    FOREIGN KEY (
        contract, blend_id, ingredient_index) 
    REFERENCES neftyblends_blend_ingredients (
        contract, blend_id, ingredient_index
    ) MATCH SIMPLE ON
        UPDATE RESTRICT
        ON
            DELETE
            RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;



DROP FUNCTION IF EXISTS neftyblends_blend_details_func(collection_name character varying(13));
CREATE FUNCTION neftyblends_blend_details_func(collection_name character varying(13))
  RETURNS TABLE (blend_id bigint, contract character varying(12), collection_name character varying(13), start_time bigint, end_time bigint, max bigint, use_count bigint, display_data text, created_at_time bigint, ingredients_count integer, security_id bigint, is_hidden boolean, ingredients jsonb, rolls jsonb, upgrades jsonb, category character varying(255))
AS
$body$

    SELECT
        blend.blend_id,
        blend.contract,
        blend.collection_name,
        blend.start_time,
        blend.end_time,
        blend.max,
        blend.use_count,
        blend.display_data,
        blend.created_at_time,
        blend.ingredients_count,
        blend.security_id,
        blend.is_hidden,
        jsonb_agg(DISTINCT jsonb_build_object(
            'type', ingredient.ingredient_type,
            'effect', ingredient.effect,
            'amount', ingredient.amount,
            'index', ingredient.ingredient_index,
            'display_data', ingredient.display_data,
            CASE
                WHEN ingredient.ingredient_type = 'TEMPLATE_INGREDIENT' THEN 'template'
                WHEN ingredient.ingredient_type = 'SCHEMA_INGREDIENT' THEN 'schema'
                WHEN ingredient.ingredient_type = 'ATTRIBUTE_INGREDIENT' THEN 'attributes'
                WHEN ingredient.ingredient_type = 'BALANCE_INGREDIENT' THEN 'template'
                WHEN ingredient.ingredient_type = 'TYPED_ATTRIBUTE_INGREDIENT' THEN 'typed_attributes'
            END,
            CASE
                WHEN ingredient.ingredient_type = 'TEMPLATE_INGREDIENT' THEN 
                    jsonb_build_object(
                        'template_id', ingredient.template_id
                    )
                WHEN ingredient.ingredient_type = 'SCHEMA_INGREDIENT' THEN 
                    jsonb_build_object(
                        'schema_name', ingredient.schema_name,
                        'collection_name', ingredient.ingredient_collection_name
                    )
                WHEN ingredient.ingredient_type = 'ATTRIBUTE_INGREDIENT' THEN
                    jsonb_build_object(
                        'attributes', attribute_ing_sub.attributes,
                        'schema_name', ingredient.schema_name,
                        'collection_name', ingredient.ingredient_collection_name
                    )
                WHEN ingredient.ingredient_type = 'BALANCE_INGREDIENT' THEN
                    jsonb_build_object(
                        'template_id', ingredient.template_id,
                        'schema_name', ingredient.schema_name
                    )
                WHEN ingredient.ingredient_type = 'TYPED_ATTRIBUTE_INGREDIENT' THEN
                    jsonb_build_object(
                        'typed_attributes', typed_attribute_ing_sub.typed_attributes,
                        'schema_name', ingredient.schema_name,
                        'collection_name', ingredient.ingredient_collection_name
                    )
            END
        )) FILTER (where ingredient.ingredient_index is not null) as ingredients,
        jsonb_agg(DISTINCT jsonb_build_object(
            'index', roll_sub.roll_index,
            'total_odds', roll_sub.total_odds,
            'outcomes', roll_sub.outcomes
        )) FILTER (where roll_sub.roll_index is not null) as rolls,
        jsonb_agg(jsonb_build_object(
            'schema_name', upg_spec_sub.schema_name,
            'display_data', upg_spec_sub.display_data,
            'upgrade_requirements', upg_spec_sub.upgrade_requirements,
            'upgrade_results', upg_spec_sub.upgrade_results
        )) FILTER (where upg_spec_sub.upgrade_spec_index is not null) as upgrade_specs,
        blend.category
    FROM
        neftyblends_blends blend
        LEFT JOIN neftyblends_blend_ingredients "ingredient" ON
            ingredient.contract = blend.contract AND
            ingredient.blend_id = blend.blend_id
        LEFT JOIN(
            SELECT
                ing_attribute.contract,
                ing_attribute.blend_id,
                ing_attribute.ingredient_index,
                jsonb_agg(jsonb_build_object(
                    'name', ing_attribute.attribute_name,
                    'allowed_values', ing_attribute.allowed_values
                )) as "attributes"
            FROM
                neftyblends_blend_ingredient_attributes ing_attribute
            GROUP BY
                ing_attribute.contract, ing_attribute.blend_id, ing_attribute.ingredient_index
        ) as attribute_ing_sub ON
            ingredient.ingredient_type = 'ATTRIBUTE_INGREDIENT' AND
            attribute_ing_sub.contract = ingredient.contract AND
            attribute_ing_sub.blend_id = ingredient.blend_id AND
            attribute_ing_sub.ingredient_index = ingredient.ingredient_index
        LEFT JOIN(
            SELECT
                ing_typed_attribute.contract,
                ing_typed_attribute.blend_id,
                ing_typed_attribute.ingredient_index,
                jsonb_agg(jsonb_build_object(
                    'name', ing_typed_attribute.attribute_name,
                    'type', ing_typed_attribute.attribute_type,
                    'allowed_values', ing_typed_attribute.allowed_values
                )) as "typed_attributes"
            FROM
                neftyblends_blend_ingredient_typed_attributes ing_typed_attribute
            GROUP BY
                ing_typed_attribute.contract, ing_typed_attribute.blend_id, ing_typed_attribute.ingredient_index
        ) AS typed_attribute_ing_sub ON
            ingredient.ingredient_type = 'TYPED_ATTRIBUTE_INGREDIENT' AND
            typed_attribute_ing_sub.contract = ingredient.contract AND
            typed_attribute_ing_sub.blend_id = ingredient.blend_id AND
            typed_attribute_ing_sub.ingredient_index = ingredient.ingredient_index
        LEFT JOIN(
            SELECT
                roll.contract,
                roll.blend_id,
                roll.roll_index,
                roll.total_odds as total_odds,
                jsonb_agg(jsonb_build_object(
                    'odds', outcome_sub.odds,
                    'results', outcome_sub.results
                )) as outcomes
            FROM
                neftyblends_blend_rolls roll
                LEFT JOIN (
                    SELECT
                        outcome.contract,
                        outcome.blend_id,
                        outcome.roll_index,
                        outcome.outcome_index,
                        outcome.odds,
                        COALESCE(jsonb_agg("result") filter (where "type" IS NOT NULL), '[]'::jsonb) as results
                    FROM
                        neftyblends_blend_roll_outcomes as outcome
                        LEFT JOIN neftyblends_blend_roll_outcome_results as "result" ON
                            outcome.contract = "result".contract AND
                            outcome.blend_id = "result".blend_id AND
                            outcome.roll_index = "result".roll_index AND
                            outcome.outcome_index = "result".outcome_index
                    GROUP BY
                        outcome.contract,
                        outcome.blend_id,
                        outcome.roll_index,
                        outcome.outcome_index,
                        outcome.odds
                ) as outcome_sub ON
                    outcome_sub.contract = roll.contract AND
                    outcome_sub.blend_id = roll.blend_id AND
                    outcome_sub.roll_index = roll.roll_index
            GROUP BY
                roll.contract, roll.blend_id, roll.roll_index, roll.total_odds
        ) AS roll_sub ON
            roll_sub.contract = blend.contract AND
            roll_sub.blend_id = blend.blend_id
        LEFT JOIN(
            SELECT
                upg_spec.contract,
                upg_spec.blend_id,
                upg_spec.upgrade_spec_index,
                upg_spec.schema_name,
                upg_spec.display_data,
                jsonb_agg(jsonb_build_object(
                    'type', upg_req_sub.type,
                    CASE
                        WHEN upg_req_sub."type" = 'TEMPLATE_REQUIREMENT' THEN 'template_requirement'
                        WHEN upg_req_sub."type" = 'TYPED_ATTRIBUTE_REQUIREMENT' THEN 'typed_attribute_requirement'
                    END,
                    CASE
                        WHEN upg_req_sub."type" = 'TEMPLATE_REQUIREMENT' THEN
                            jsonb_build_object(
                                'template_id', upg_req_sub.template_id
                            )
                        WHEN upg_req_sub."type" = 'TYPED_ATTRIBUTE_REQUIREMENT' THEN
                            upg_req_sub.typed_attribute_definition
                    END
                )) FILTER (where upg_req_sub.upgrade_requirement_index is not null) as upgrade_requirements, -- could have a typed_attributes subquery like ingredients
                jsonb_agg(jsonb_build_object(
                    'attribute_name', upg_res_sub.attribute_name,
                    'attribute_type', upg_res_sub.attribute_type,
                    'upgrade_operator', upg_res_sub.upgrade_operator,
                    'result_value_type', upg_res_sub.result_value_type,
                    'result_value',
                    CASE
                        WHEN upg_res_sub.result_value_type = 'VALUE_ROLL_RESULT' THEN
                            jsonb_build_object(
                                -- @TODO?,  do the join with valueroll table
                                'valueroll_id', upg_res_sub.valueroll_id
                            )
                        WHEN upg_res_sub.result_value_type = 'IMMEDIATE_VALUE' AND upg_res_sub.immediate_type = 'string' THEN
                            jsonb_build_object(
                                'immediate_type', upg_res_sub.immediate_type,
                                'immediate_result', upg_res_sub.immediate_string
                            )
                        WHEN upg_res_sub.result_value_type = 'IMMEDIATE_VALUE' AND upg_res_sub.immediate_type = 'uint64' THEN
                            jsonb_build_object(
                                'immediate_type', upg_res_sub.immediate_type,
                                'immediate_result', upg_res_sub.immediate_uint64
                            )
                    END
                )) FILTER (where upg_res_sub.upgrade_result_index is not null) as upgrade_results
            FROM
                neftyblends_blend_upgrade_specs upg_spec
                LEFT JOIN (
                    SELECT
                        upg_req.contract,
                        upg_req.blend_id,
                        upg_req.upgrade_spec_index,
                        upg_req.upgrade_requirement_index,
                        upg_req.type,
                        upg_req.template_id,
                        upg_req.typed_attribute_definition
                    FROM
                        neftyblends_blend_upgrade_spec_upgrade_requirements upg_req
                ) AS upg_req_sub ON
                    upg_req_sub.contract = upg_spec.contract AND
                    upg_req_sub.blend_id = upg_spec.blend_id AND
                    upg_req_sub.upgrade_spec_index = upg_spec.upgrade_spec_index
                LEFT JOIN (
                    SELECT
                        upg_res.contract,
                        upg_res.blend_id,
                        upg_res.upgrade_spec_index,
                        upg_res.upgrade_result_index,
                        upg_res.attribute_name,
                        upg_res.attribute_type,
                        upg_res.upgrade_operator,
                        upg_res.blend_collection_name,
                        upg_res.result_value_type,
                        upg_res.immediate_type,
                        upg_res.valueroll_id,
                        upg_res.immediate_string,
                        upg_res.immediate_uint64
                    FROM
                        neftyblends_blend_upgrade_spec_upgrade_results upg_res
                ) AS upg_res_sub ON
                    upg_res_sub.contract = upg_spec.contract AND
                    upg_res_sub.blend_id = upg_spec.blend_id AND
                    upg_res_sub.upgrade_spec_index = upg_spec.upgrade_spec_index
            GROUP BY
                upg_spec.contract, upg_spec.blend_id, upg_spec.upgrade_spec_index, upg_spec.schema_name, upg_spec.display_data
        ) as upg_spec_sub ON
            upg_spec_sub.contract = blend.contract AND
            upg_spec_sub.blend_id = blend.blend_id
    WHERE
        blend.contract = $1
    GROUP BY
        blend.blend_id,
        blend.contract,
        blend.collection_name,
        blend.start_time,
        blend.end_time,
        blend.max,
        blend.use_count,
        blend.display_data,
        blend.created_at_time,
        blend.ingredients_count;

$body$
LANGUAGE SQL;

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

DROP VIEW IF EXISTS neftyblends_blend_details_master;
CREATE OR REPLACE VIEW neftyblends_blend_details_master AS
SELECT
    blend.blend_id,
    blend.contract,
    blend.collection_name,
    blend.start_time,
    blend.end_time,
    blend.max,
    blend.use_count,
    blend.display_data,
    blend.created_at_time,
    blend.ingredients_count,
    blend.security_id,
    blend.is_hidden,
    jsonb_agg(DISTINCT jsonb_build_object(
        'type', ingredient.ingredient_type,
        'effect', ingredient.effect,
        'amount', ingredient.amount,
        'index', ingredient.ingredient_index,
        'display_data', ingredient.display_data,
        CASE
            WHEN ingredient.ingredient_type = 'TEMPLATE_INGREDIENT' THEN 'template'
            WHEN ingredient.ingredient_type = 'SCHEMA_INGREDIENT' THEN 'schema'
            WHEN ingredient.ingredient_type = 'ATTRIBUTE_INGREDIENT' THEN 'attributes'
            WHEN ingredient.ingredient_type = 'BALANCE_INGREDIENT' THEN 'template'
            WHEN ingredient.ingredient_type = 'TYPED_ATTRIBUTE_INGREDIENT' THEN 'typed_attributes'
        END,
        CASE
            WHEN ingredient.ingredient_type = 'TEMPLATE_INGREDIENT' THEN 
                jsonb_build_object(
                    'template_id', ingredient.template_id
                )
            WHEN ingredient.ingredient_type = 'SCHEMA_INGREDIENT' THEN 
                jsonb_build_object(
                    'schema_name', ingredient.schema_name,
                    'collection_name', ingredient.ingredient_collection_name
                )
            WHEN ingredient.ingredient_type = 'ATTRIBUTE_INGREDIENT' THEN
                jsonb_build_object(
                    'attributes', attribute_ing_sub.attributes,
                    'schema_name', ingredient.schema_name,
                    'collection_name', ingredient.ingredient_collection_name
                )
            WHEN ingredient.ingredient_type = 'BALANCE_INGREDIENT' THEN
                jsonb_build_object(
                    'template_id', ingredient.template_id,
                    'schema_name', ingredient.schema_name
                )
            WHEN ingredient.ingredient_type = 'TYPED_ATTRIBUTE_INGREDIENT' THEN
                jsonb_build_object(
                    'typed_attributes', typed_attribute_ing_sub.typed_attributes,
                    'schema_name', ingredient.schema_name,
                    'collection_name', ingredient.ingredient_collection_name
                )
        END
    )) FILTER (where ingredient.ingredient_index is not null) as ingredients,
    jsonb_agg(DISTINCT jsonb_build_object(
        'index', roll_sub.roll_index,
        'total_odds', roll_sub.total_odds,
        'outcomes', roll_sub.outcomes
    )) FILTER (where roll_sub.roll_index is not null) as rolls,
    jsonb_agg(jsonb_build_object(
        'schema_name', upg_spec_sub.schema_name,
        'display_data', upg_spec_sub.display_data,
        'upgrade_requirements', upg_spec_sub.upgrade_requirements,
        'upgrade_results', upg_spec_sub.upgrade_results
    )) FILTER (where upg_spec_sub.upgrade_spec_index is not null) as upgrade_specs,
    blend.category
FROM
    neftyblends_blends blend
    LEFT JOIN neftyblends_blend_ingredients "ingredient" ON
        ingredient.contract = blend.contract AND
        ingredient.blend_id = blend.blend_id
    LEFT JOIN(
        SELECT
            ing_attribute.contract,
            ing_attribute.blend_id,
            ing_attribute.ingredient_index,
            jsonb_agg(jsonb_build_object(
                'name', ing_attribute.attribute_name,
                'allowed_values', ing_attribute.allowed_values
            )) as "attributes"
        FROM
            neftyblends_blend_ingredient_attributes ing_attribute
        GROUP BY
            ing_attribute.contract, ing_attribute.blend_id, ing_attribute.ingredient_index
    ) as attribute_ing_sub ON
        ingredient.ingredient_type = 'ATTRIBUTE_INGREDIENT' AND
        attribute_ing_sub.contract = ingredient.contract AND
        attribute_ing_sub.blend_id = ingredient.blend_id AND
        attribute_ing_sub.ingredient_index = ingredient.ingredient_index
    LEFT JOIN(
        SELECT
            ing_typed_attribute.contract,
            ing_typed_attribute.blend_id,
            ing_typed_attribute.ingredient_index,
            jsonb_agg(jsonb_build_object(
                'name', ing_typed_attribute.attribute_name,
                'type', ing_typed_attribute.attribute_type,
                'allowed_values', ing_typed_attribute.allowed_values
            )) as "typed_attributes"
        FROM
            neftyblends_blend_ingredient_typed_attributes ing_typed_attribute
        GROUP BY
            ing_typed_attribute.contract, ing_typed_attribute.blend_id, ing_typed_attribute.ingredient_index
    ) AS typed_attribute_ing_sub ON
        ingredient.ingredient_type = 'TYPED_ATTRIBUTE_INGREDIENT' AND
        typed_attribute_ing_sub.contract = ingredient.contract AND
        typed_attribute_ing_sub.blend_id = ingredient.blend_id AND
        typed_attribute_ing_sub.ingredient_index = ingredient.ingredient_index
    LEFT JOIN(
        SELECT
            roll.contract,
            roll.blend_id,
            roll.roll_index,
            roll.total_odds as total_odds,
            jsonb_agg(jsonb_build_object(
                'odds', outcome_sub.odds,
                'results', outcome_sub.results
            )) as outcomes
        FROM
            neftyblends_blend_rolls roll
            LEFT JOIN (
                SELECT
                    outcome.contract,
                    outcome.blend_id,
                    outcome.roll_index,
                    outcome.outcome_index,
                    outcome.odds,
                    COALESCE(jsonb_agg("result") filter (where "type" IS NOT NULL), '[]'::jsonb) as results
                FROM
                    neftyblends_blend_roll_outcomes as outcome
                    LEFT JOIN neftyblends_blend_roll_outcome_results as "result" ON
                        outcome.contract = "result".contract AND
                        outcome.blend_id = "result".blend_id AND
                        outcome.roll_index = "result".roll_index AND
                        outcome.outcome_index = "result".outcome_index
                GROUP BY
                    outcome.contract,
                    outcome.blend_id,
                    outcome.roll_index,
                    outcome.outcome_index,
                    outcome.odds
            ) as outcome_sub ON
                outcome_sub.contract = roll.contract AND
                outcome_sub.blend_id = roll.blend_id AND
                outcome_sub.roll_index = roll.roll_index
        GROUP BY
            roll.contract, roll.blend_id, roll.roll_index, roll.total_odds
    ) AS roll_sub ON
        roll_sub.contract = blend.contract AND
        roll_sub.blend_id = blend.blend_id
    LEFT JOIN(
        SELECT
            upg_spec.contract,
            upg_spec.blend_id,
            upg_spec.upgrade_spec_index,
            upg_spec.schema_name,
            upg_spec.display_data,
            jsonb_agg(jsonb_build_object(
                'type', upg_req_sub.type,
                CASE
                    WHEN upg_req_sub."type" = 'TEMPLATE_REQUIREMENT' THEN 'template_requirement'
                    WHEN upg_req_sub."type" = 'TYPED_ATTRIBUTE_REQUIREMENT' THEN 'typed_attribute_requirement'
                END,
                CASE
                    WHEN upg_req_sub."type" = 'TEMPLATE_REQUIREMENT' THEN
                        jsonb_build_object(
                            'template_id', upg_req_sub.template_id
                        )
                    WHEN upg_req_sub."type" = 'TYPED_ATTRIBUTE_REQUIREMENT' THEN
                        upg_req_sub.typed_attribute_definition
                END
            )) FILTER (where upg_req_sub.upgrade_requirement_index is not null) as upgrade_requirements, -- could have a typed_attributes subquery like ingredients
            jsonb_agg(jsonb_build_object(
                'attribute_name', upg_res_sub.attribute_name,
                'attribute_type', upg_res_sub.attribute_type,
                'upgrade_operator', upg_res_sub.upgrade_operator,
                'result_value_type', upg_res_sub.result_value_type,
                'result_value',
                CASE
                    WHEN upg_res_sub.result_value_type = 'VALUE_ROLL_RESULT' THEN
                        jsonb_build_object(
                            -- @TODO?,  do the join with valueroll table
                            'valueroll_id', upg_res_sub.valueroll_id
                        )
                    WHEN upg_res_sub.result_value_type = 'IMMEDIATE_VALUE' AND upg_res_sub.immediate_type = 'string' THEN
                        jsonb_build_object(
                            'immediate_type', upg_res_sub.immediate_type,
                            'immediate_result', upg_res_sub.immediate_string
                        )
                    WHEN upg_res_sub.result_value_type = 'IMMEDIATE_VALUE' AND upg_res_sub.immediate_type = 'uint64' THEN
                        jsonb_build_object(
                            'immediate_type', upg_res_sub.immediate_type,
                            'immediate_result', upg_res_sub.immediate_uint64
                        )
                END
            )) FILTER (where upg_res_sub.upgrade_result_index is not null) as upgrade_results
        FROM
            neftyblends_blend_upgrade_specs upg_spec
            LEFT JOIN (
                SELECT
                    upg_req.contract,
                    upg_req.blend_id,
                    upg_req.upgrade_spec_index,
                    upg_req.upgrade_requirement_index,
                    upg_req.type,
                    upg_req.template_id,
                    upg_req.typed_attribute_definition
                FROM
                    neftyblends_blend_upgrade_spec_upgrade_requirements upg_req
            ) AS upg_req_sub ON
                upg_req_sub.contract = upg_spec.contract AND
                upg_req_sub.blend_id = upg_spec.blend_id AND
                upg_req_sub.upgrade_spec_index = upg_spec.upgrade_spec_index
            LEFT JOIN (
                SELECT
                    upg_res.contract,
                    upg_res.blend_id,
                    upg_res.upgrade_spec_index,
                    upg_res.upgrade_result_index,
                    upg_res.attribute_name,
                    upg_res.attribute_type,
                    upg_res.upgrade_operator,
                    upg_res.blend_collection_name,
                    upg_res.result_value_type,
                    upg_res.immediate_type,
                    upg_res.valueroll_id,
                    upg_res.immediate_string,
                    upg_res.immediate_uint64
                FROM
                    neftyblends_blend_upgrade_spec_upgrade_results upg_res
            ) AS upg_res_sub ON
                upg_res_sub.contract = upg_spec.contract AND
                upg_res_sub.blend_id = upg_spec.blend_id AND
                upg_res_sub.upgrade_spec_index = upg_spec.upgrade_spec_index
        GROUP BY
            upg_spec.contract, upg_spec.blend_id, upg_spec.upgrade_spec_index, upg_spec.schema_name, upg_spec.display_data
    ) as upg_spec_sub ON
        upg_spec_sub.contract = blend.contract AND
        upg_spec_sub.blend_id = blend.blend_id
GROUP BY
    blend.blend_id,
    blend.contract,
    blend.collection_name,
    blend.start_time,
    blend.end_time,
    blend.max,
    blend.use_count,
    blend.display_data,
    blend.created_at_time,
    blend.ingredients_count;




