CREATE TABLE atomichub_browsers
(
    id integer NOT NULL,
    account character varying(12) COLLATE pg_catalog."default" NOT NULL,
    url character varying(256) COLLATE pg_catalog."default" NOT NULL,
    public_key character varying(256) COLLATE pg_catalog."default" NOT NULL,
    secret character varying(256) COLLATE pg_catalog."default" NOT NULL,
    created bigint NOT NULL,
    CONSTRAINT atomichub_browsers_pkey PRIMARY KEY (id),
    CONSTRAINT atomichub_browsers_webpush UNIQUE (account, url, public_key, secret)
);

CREATE SEQUENCE atomichub_browsers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE atomichub_browsers_id_seq OWNED BY atomichub_browsers.id;

CREATE TABLE atomichub_watchlist
(
    account character varying(12) COLLATE pg_catalog."default" NOT NULL,
    contract character varying(12) COLLATE pg_catalog."default" NOT NULL,
    asset_id bigint NOT NULL,
    created bigint NOT NULL,
    CONSTRAINT atomichub_watchlist_pkey PRIMARY KEY (account, contract, asset_id),
    CONSTRAINT atomichub_watchlist_asset_id FOREIGN KEY (asset_id, contract)
        REFERENCES public.atomicassets_assets (asset_id, contract) MATCH SIMPLE
        ON UPDATE RESTRICT
        ON DELETE RESTRICT
        DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE atomichub_notifications
(
    id integer NOT NULL,
    account character varying(12) COLLATE pg_catalog."default" NOT NULL,
    message character varying(256) COLLATE pg_catalog."default" NOT NULL,
    reference json NOT NULL,
    block_num bigint NOT NULL,
    block_time bigint NOT NULL,
    CONSTRAINT atomichub_notifications_pkey PRIMARY KEY (id)
);

CREATE SEQUENCE atomichub_notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE atomichub_notifications_id_seq OWNED BY atomichub_notifications.id;
ALTER TABLE ONLY atomichub_notifications ALTER COLUMN id SET DEFAULT nextval('atomichub_notifications_id_seq'::regclass);

CREATE INDEX atomichub_browsers_account ON atomichub_browsers USING btree (account);

CREATE INDEX atomichub_watchlist_account ON atomichub_watchlist USING btree (account);
CREATE INDEX atomichub_watchlist_created ON atomichub_watchlist USING btree (created);

CREATE INDEX atomichub_notifications_account ON atomichub_notifications USING btree (account);
CREATE INDEX atomichub_notifications_block_num ON atomichub_notifications USING btree (block_num);
