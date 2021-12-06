ALTER TABLE neftydrops_drops ADD COLUMN IF NOT EXISTS current_claimed bigint NOT NULL DEFAULT 0;

UPDATE neftydrops_drops
SET current_claimed = drop_stats.claims
FROM
    (
        SELECT ndrop.drop_id, COALESCE(SUM(claim.amount), 0) as claims
        FROM neftydrops_drops ndrop
                 LEFT JOIN neftydrops_claims claim ON (claim.drops_contract = ndrop.drops_contract AND claim.drop_id = ndrop.drop_id)
        GROUP BY ndrop.drop_id
    ) drop_stats
WHERE drop_stats.drop_id = neftydrops_drops.drop_id;

