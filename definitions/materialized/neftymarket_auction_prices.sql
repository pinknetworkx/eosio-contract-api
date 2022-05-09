CREATE MATERIALIZED VIEW IF NOT EXISTS neftymarket_dutch_auction_prices AS
SELECT market_contract,
       auction_id,
       CASE
           WHEN auction_type = 1
               THEN LEAST(
                   (
                       ROUND(
                                   buy_now_price *
                                   POWER(
                                               1 - discount_rate,
                                               FLOOR(LEAST(extract(epoch from now()), end_time) -
                                                     start_time / discount_interval)
                                       )
                           )
                       ),
                   min_price
               )
           ELSE buy_now_price
           END
           as buy_now_price_dynamic
FROM neftymarket_auctions auction
WHERE buy_now_price > 0;

CREATE UNIQUE INDEX neftymarket_dutch_auction_prices_pkey ON neftymarket_dutch_auction_prices (market_contract, auction_id);
CREATE INDEX neftymarket_dutch_auction_prices_price ON neftymarket_dutch_auction_prices USING btree (buy_now_price_dynamic);
