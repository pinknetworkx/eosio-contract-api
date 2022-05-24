CREATE OR REPLACE FUNCTION
    is_ingredient_attribute_match
(
    IN _template_id bigint,
    IN _blend_id bigint,
    IN _ingredient_index bigint,
    IN _ingredient_total_attributes integer
)
    RETURNS bool
    LANGUAGE plpgsql
as
$$
declare
    _matched_attributes integer := NULL;
BEGIN
    _matched_attributes := (
        SELECT sub.matched_attributes
        FROM
            (
                SELECT
                    attribute.blend_id,
                    attribute.ingredient_index,
                    count(1) as matched_attributes
                FROM
                    neftyblends_blend_ingredient_attributes attribute
                        JOIN atomicassets_templates template ON
                            template.template_id = _template_id
                            AND template.transferable IS DISTINCT FROM FALSE
                            AND template.burnable IS DISTINCT FROM FALSE
                WHERE
                    attribute.blend_id = _blend_id AND
                    attribute.ingredient_index = _ingredient_index AND
                    (
                        template.immutable_data->>attribute.attribute_name IS NOT NULL AND
                        template.immutable_data->>attribute.attribute_name = ANY(attribute.allowed_values)
                    )
                GROUP BY
                    attribute.blend_id,
                    attribute.ingredient_index
            )as sub
    );


    raise notice 'Matched attributes: %', _matched_attributes;

    IF _matched_attributes IS NULL THEN
        RETURN false;
    END IF;

    RETURN _matched_attributes >= _ingredient_total_attributes;
END;
$$;
