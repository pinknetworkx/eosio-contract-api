CREATE MATERIALIZED VIEW IF NOT EXISTS nefy_quest_leaderboard_{{quest_id}} AS
SELECT rank() OVER (ORDER BY experience DESC) "rank",
       account,
       total_sold,
       total_bought,
       items_sold,
       items_bought,
       total_collected,
       (total_collected / {{total_to_collect}}::numeric) completion_percentage,
       experience,
       tokens.token_symbol symbol,
       tokens.token_precision symbol_precision
FROM (
     SELECT
       COALESCE(seller, buyer) account,
        COALESCE(nefty_sells.total_sold, 0) total_sold,
        COALESCE(nefty_buys.total_bought, 0) total_bought,
        COALESCE(nefty_sells.sold_items, 0) items_sold,
        COALESCE(nefty_buys.bought_items, 0) items_bought,
        COALESCE(templates_owned.total, 0) total_collected,
        COALESCE(nefty_sells.symbol, nefty_buys.symbol) AS symbol,
        (
                (CASE WHEN templates_owned.total >= {{total_to_collect}} THEN {{completion_multiplier}} ELSE 1 END) *
                (
                        {{points_per_volume}} * (COALESCE(nefty_sells.total_sold, 0) + COALESCE(nefty_buys.total_bought, 0)) / {{volume_threshold}} +
                        (COALESCE(nefty_sells.sold_items, 0) + COALESCE(nefty_buys.bought_items, 0)) * {{points_per_asset}}
                )
        ) experience
    FROM
    (
        SELECT seller, count(*) FILTER (WHERE final_price > {{min_asset_value}}) as sold_items,
        SUM(final_price)                               as total_sold,
        settlement_symbol                              as symbol
        FROM atomicmarket_sales
        WHERE maker_marketplace = '{{marketplace}}'
        AND state = {{state}}
        AND updated_at_time
            > '{{start_time}}'
        AND updated_at_time
            < '{{end_time}}'
        GROUP BY seller, settlement_symbol
    ) AS nefty_sells
    FULL OUTER JOIN
    (
        SELECT buyer,
        count(*) FILTER (WHERE final_price > {{min_asset_value}}) as bought_items,
        SUM(final_price)                               as total_bought,
        settlement_symbol                              as symbol
        FROM atomicmarket_sales
        WHERE taker_marketplace = '{{marketplace}}'
        AND state = {{state}}
        AND updated_at_time
            > '{{start_time}}'
        AND updated_at_time
            < '{{end_time}}'
        GROUP BY buyer, settlement_symbol
    ) AS nefty_buys
    ON nefty_buys.buyer = nefty_sells.seller
    FULL OUTER JOIN
    (
        SELECT owner, COUNT(DISTINCT template_id) total
        FROM atomicassets_assets
        WHERE template_id IN ({{templates}})
        AND (atomicassets_assets.updated_at_time < '{{end_time}}' OR atomicassets_assets.minted_at_time < '{{end_time}}')
        AND atomicassets_assets.owner IS NOT NULL
        GROUP BY owner
    ) AS templates_owned
    ON nefty_buys.buyer = templates_owned.owner
    WHERE COALESCE(seller, buyer) IS NOT NULL
    ) AS leaderboard
    JOIN atomicmarket_tokens AS tokens ON tokens.token_symbol = leaderboard.symbol
WHERE (total_sold + total_bought) > {{min_volume}};

CREATE UNIQUE INDEX nefy_quest_leaderboard_pkey_{{quest_id}} ON nefy_quest_leaderboard_{{quest_id}} (account);

CREATE INDEX nefy_quest_leaderboard_account_{{quest_id}} ON nefy_quest_leaderboard_{{quest_id}} USING btree (account);
CREATE INDEX nefy_quest_leaderboard_experience_{{quest_id}} ON nefy_quest_leaderboard_{{quest_id}} USING btree (experience);
