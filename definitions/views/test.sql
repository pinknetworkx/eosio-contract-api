SELECT
  listing.buyoffer_id
FROM
  atomicmarket_buyoffers listing
  JOIN atomicmarket_tokens "token" ON (
    listing.market_contract = "token".market_contract
    AND listing.token_symbol = "token".token_symbol
  )
WHERE
  listing.market_contract = $ 1
  AND NOT EXISTS (
    SELECT
      *
    FROM
      atomicmarket_buyoffers_assets buyoffer_asset
    WHERE
      buyoffer_asset.market_contract = listing.market_contract
      AND buyoffer_asset.buyoffer_id = listing.buyoffer_id
      AND NOT EXISTS (
        SELECT
          *
        FROM
          atomicassets_assets asset
        WHERE
          asset.contract = buyoffer_asset.assets_contract
          AND asset.asset_id = buyoffer_asset.asset_id
      )
  )
  AND listing.buyer = $ 2
  AND (
    (
      listing.state = 0
      AND NOT EXISTS(
        SELECT
          *
        FROM
          atomicmarket_buyoffer_assets buyoffer_asset,
          atomicassets_assets asset
      )
      WHERE
        asset.contract = buyoffer_asset.assets_contract
        AND asset.asset_id = buyoffer_asset.asset_id
        AND buyoffer_asset.market_contract = listing.market_contract
        AND buyoffer_asset.buyoffer_id = listing.buyoffer_id
        AND asset.owner != listing.seller
    )
  )
ORDER BY
  listing.created_at_time desc,
  listing.buyoffer_id ASC
LIMIT
  $ 3 OFFSET $ 4
