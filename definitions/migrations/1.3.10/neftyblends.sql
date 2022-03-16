ALTER TABLE neftyblends_blends ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;
ALTER TABLE neftyblends_blend_ingredient_attributes ADD COLUMN IF NOT EXISTS display_data text;

CREATE
    INDEX neftyblends_blends_collection_is_hidden ON neftyblends_blends USING btree (is_hidden);
