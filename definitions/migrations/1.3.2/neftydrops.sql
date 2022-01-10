ALTER TABLE neftydrops_drops ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;
ALTER TABLE neftydrops_drops ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;

CREATE
    INDEX neftydrops_drops_collection_is_hidden ON neftydrops_drops USING btree (is_hidden);
CREATE
    INDEX neftydrops_drops_collection_is_deleted ON neftydrops_drops USING btree (is_deleted);
CREATE
    INDEX neftydrops_drops_collection_current_claimed ON neftydrops_drops USING btree (current_claimed);

UPDATE neftydrops_drops
SET is_hidden = drop_stats.is_hidden, is_deleted = drop_stats.is_deleted
FROM
    (
        SELECT ndrop.drop_id,
               (CASE WHEN ndrop.state = 2 THEN true ELSE false END) AS is_hidden,
               (CASE WHEN ndrop.state = 1 THEN true ELSE false END) AS is_deleted
        FROM neftydrops_drops ndrop
    ) drop_stats
WHERE drop_stats.drop_id = neftydrops_drops.drop_id;

DROP MATERIALIZED VIEW neftydrops_drop_prices;
DROP VIEW neftydrops_drop_prices_master;
DROP VIEW neftydrops_drops_master;

ALTER TABLE neftydrops_drops DROP COLUMN IF EXISTS state;
