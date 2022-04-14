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
    blend.category,
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
                WHEN ingredient.ingredient_type = 'CHEST_INGREDIENT' THEN 'template'
                END,
            CASE
                WHEN ingredient.ingredient_type = 'TEMPLATE_INGREDIENT' THEN jsonb_build_object(
                        'template_id', ingredient.template_id
                    )
                WHEN ingredient.ingredient_type = 'SCHEMA_INGREDIENT' THEN jsonb_build_object(
                        'schema_name', ingredient.schema_name,
                        'collection_name', ingredient.ingredient_collection_name
                    )
                WHEN ingredient.ingredient_type = 'ATTRIBUTE_INGREDIENT' THEN jsonb_build_object(
                        'attributes', attribute_ing_sub.attributes,
                        'schema_name', ingredient.schema_name,
                        'collection_name', ingredient.ingredient_collection_name
                    )
                WHEN ingredient.ingredient_type = 'CHEST_INGREDIENT' THEN jsonb_build_object(
                        'template_id', ingredient.template_id,
                        'schema_name', ingredient.schema_name
                    )
                END
        )) as ingredients,
    jsonb_agg(DISTINCT jsonb_build_object(
            'index', roll_sub.roll_index,
            'total_odds', roll_sub.total_odds,
            'outcomes', roll_sub.outcomes
        )) as rolls
FROM
    neftyblends_blends blend
        JOIN neftyblends_blend_ingredients "ingredient" ON
                ingredient.contract = blend.contract
            AND ingredient.blend_id = blend.blend_id
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
        group by
            roll.contract, roll.blend_id, roll.roll_index, roll.total_odds
    ) as roll_sub ON
                roll_sub.contract = blend.contract AND
                roll_sub.blend_id = blend.blend_id
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

