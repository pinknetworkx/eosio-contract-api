CREATE OR REPLACE VIEW atomicmarket_template_prices_master AS
    SELECT
        t2.market_contract, t2.assets_contract::text, t2.collection_name, t2.template_id, t2.symbol,
        PERCENTILE_DISC(0.5) WITHIN GROUP (ORDER BY t2.price) median,
        AVG(t2.price)::bigint average,
        PERCENTILE_DISC(0.5) WITHIN GROUP (ORDER BY t2.price) FILTER (WHERE t2.number <= 5 OR t2."time" / 1000 >= extract(epoch from now()) - 3600 * 24 * 3) suggested_median,
        (AVG(t2.price) FILTER (WHERE t2.number <= 5 OR t2."time" / 1000 >= extract(epoch from now()) - 3600 * 24 * 3))::bigint suggested_average,
        MIN(t2.price) "min", MAX(t2.price) "max", COUNT(*) sales
    FROM (
        SELECT
            t1.*, row_number() OVER (PARTITION BY t1.assets_contract, t1.collection_name, t1.template_id ORDER BY t1."time" DESC) "number"
        FROM atomicmarket_stats_prices_master t1
    ) t2
    GROUP BY t2.market_contract, t2.assets_contract, t2.collection_name, t2.template_id, t2.symbol
