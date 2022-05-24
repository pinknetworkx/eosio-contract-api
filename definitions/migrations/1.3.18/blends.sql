DROP VIEW IF EXISTS neftyblends_blend_details_master;

ALTER TABLE neftyblends_blend_ingredients ADD COLUMN IF NOT EXISTS ft_ingredient_quantity_price bigint;
ALTER TABLE neftyblends_blend_ingredients ADD COLUMN IF NOT EXISTS ft_ingredient_quantity_symbol character varying(12);

CREATE TABLE IF NOT EXISTS neftyblends_config
(
    contract      character varying(12) NOT NULL,
    fee           double precision      NOT NULL,
    fee_recipient character varying(12) NOT NULL,
    CONSTRAINT neftyblends_config_pkey PRIMARY KEY (contract)
);

CREATE TABLE IF NOT EXISTS neftyblends_tokens
(
    contract character varying(12) NOT NULL,
    token_contract  character varying(12) NOT NULL,
    token_symbol    character varying(12) NOT NULL,
    token_precision integer               NOT NULL,
    CONSTRAINT neftyblends_tokens_pkey PRIMARY KEY (contract, token_symbol)
);

ALTER TABLE ONLY neftyblends_blend_ingredients
    ADD CONSTRAINT neftyblends_blend_ingredients_token_symbol_fkey FOREIGN KEY (contract, ft_ingredient_quantity_symbol)
        REFERENCES neftyblends_tokens (contract, token_symbol) MATCH SIMPLE ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID;
