ALTER TABLE neftydrops_drop_assets DROP COLUMN tokens_to_back;
ALTER TABLE neftydrops_drop_assets ADD COLUMN IF NOT EXISTS tokens_to_back character varying(100)[];
