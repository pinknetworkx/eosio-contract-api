UPDATE neftydrops_drops
SET
    start_time = drop_stats.start_time * 1000,
    end_time = drop_stats.end_time * 1000
FROM
    (
        SELECT ndrop.drop_id, ndrop.start_time, ndrop.end_time
        FROM neftydrops_drops ndrop
    ) drop_stats
WHERE drop_stats.drop_id = neftydrops_drops.drop_id;

