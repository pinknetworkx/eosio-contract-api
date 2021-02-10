CREATE OR REPLACE FUNCTION remove_long_jsonb_pairs(p_input jsonb, p_maxlen int) RETURNS jsonb AS
$$
  SELECT COALESCE(jsonb_object_agg(e.ky, e.val), '{}')
  FROM jsonb_each(p_input) AS e(ky, val)
  WHERE length(e.val::text) <= p_maxlen;
$$
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE;
