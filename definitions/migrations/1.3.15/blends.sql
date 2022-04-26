ALTER TABLE neftyblends_blend_ingredients ADD COLUMN IF NOT EXISTS balance_ingredient_attribute_name text;
ALTER TABLE neftyblends_blend_ingredients ADD COLUMN IF NOT EXISTS balance_ingredient_cost numeric;
