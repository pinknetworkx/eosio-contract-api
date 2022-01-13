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
    _matched_attributes := (SELECT sub.matched_attributes
                            FROM
                                (
                                    SELECT
                                        ia.blend_id,
                                        ia.ingredient_index,
                                        count(1) as matched_attributes
                                    FROM
                                        neftyblends_blend_ingredient_attributes ia
                                            JOIN atomicassets_templates t ON
                                                t.template_id = _template_id
                                    WHERE
                                            ia.blend_id = _blend_id AND
                                            ia.ingredient_index = _ingredient_index AND
                                        (
                                                    t.immutable_data->>ia.attribute_name IS NOT NULL AND
                                                    t.immutable_data->>ia.attribute_name = ANY(ia.allowed_values)
                                            )
                                    GROUP BY
                                        ia.blend_id,
                                        ia.ingredient_index
                                )as sub);


    raise notice 'Matched attributes: %', _matched_attributes;

    IF _matched_attributes IS NULL THEN
        RETURN false;
    END IF;

    RETURN _matched_attributes >= _ingredient_total_attributes;
END;
$$;
