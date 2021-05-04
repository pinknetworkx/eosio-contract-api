ALTER TABLE atomicmarket_sales ADD COLUMN IF NOT EXISTS template_mint int4range;
ALTER TABLE atomicmarket_buyoffers ADD COLUMN IF NOT EXISTS template_mint int4range;
ALTER TABLE atomicmarket_auctions ADD COLUMN IF NOT EXISTS template_mint int4range;

CREATE INDEX atomicmarket_sales_missing_mint ON atomicmarket_sales(assets_contract, sale_id, offer_id) WHERE template_mint IS NULL;
CREATE INDEX atomicmarket_buyoffers_missing_mint ON atomicmarket_buyoffers(assets_contract, buyoffer_id) WHERE template_mint IS NULL;
CREATE INDEX atomicmarket_auctions_missing_mint ON atomicmarket_auctions(assets_contract, auction_id) WHERE template_mint IS NULL;
