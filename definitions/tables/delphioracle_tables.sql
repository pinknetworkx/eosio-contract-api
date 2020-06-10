CREATE TABLE delphioracle_pairs (
    contract character varying(12) NOT NULL,
    delphi_pair_name character varying(12),
    base_symbol character varying(12) NOT NULL,
    base_precision integer NOT NULL,
    quote_symbol character varying(12) NOT NULL,
    quote_precision integer NOT NULL,
    price_precision integer NOT NULL,
    median integer,
    updated_at_time bigint NOT NULL,
    updated_at_block bigint NOT NULL,
    CONSTRAINT delphioracle_pairs_pkey PRIMARY KEY (contract, delphi_pair_name)
);
