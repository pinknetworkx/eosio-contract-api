ALTER TABLE neftyblends_blends ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;

CREATE
    INDEX neftyblends_blends_collection_is_hidden ON neftyblends_blends USING btree (is_hidden);
