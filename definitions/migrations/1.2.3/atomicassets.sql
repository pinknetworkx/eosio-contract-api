DROP TABLE IF EXISTS atomicassets_template_counts;
CREATE TABLE atomicassets_template_counts (
    contract varchar(12) not null,
    template_id bigint,
    assets integer,
    burned integer,
    owned integer,
    dirty boolean DEFAULT TRUE
);

-- 10 s
INSERT INTO atomicassets_template_counts
    SELECT
        contract, template_id,
        COUNT(*) assets,
        COUNT(*) FILTER (WHERE owner IS NULL) burned,
        COUNT(*) FILTER (WHERE owner IS NOT NULL) AS owned,
        NULL dirty
    FROM atomicassets_assets
    WHERE template_id IS NOT NULL
    GROUP BY contract, template_id
;

CREATE INDEX atomicassets_template_counts_dirty ON atomicassets_template_counts(contract, template_id) WHERE dirty;
CREATE INDEX atomicassets_template_counts_contract_template_id ON atomicassets_template_counts(contract, template_id);

CREATE OR REPLACE FUNCTION update_atomicassets_template_counts() RETURNS TRIGGER AS $$
DECLARE
    update_and_changed BOOLEAN = (TG_OP = 'UPDATE') AND (OLD.contract IS DISTINCT FROM NEW.contract OR OLD.template_id IS DISTINCT FROM NEW.template_id OR OLD.owner IS DISTINCT FROM NEW.owner);
BEGIN
    IF (update_and_changed OR (TG_OP = 'DELETE')) THEN
        INSERT INTO atomicassets_template_counts (contract, template_id, assets, burned, owned)
        VALUES (OLD.contract, COALESCE(OLD.template_id, 0), -1, CASE WHEN OLD.owner IS NULL THEN -1 END, CASE WHEN OLD.owner IS NOT NULL THEN -1 END);
    END IF;

    IF (update_and_changed OR (TG_OP = 'INSERT')) THEN
        INSERT INTO atomicassets_template_counts (contract, template_id, assets, burned, owned)
        VALUES (NEW.contract, COALESCE(NEW.template_id, 0), 1, CASE WHEN NEW.owner IS NULL THEN 1 END, CASE WHEN NEW.owner IS NOT NULL THEN 1 END);
    END IF;

    RETURN NULL;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_atomicassets_template_counts_tr ON atomicassets_assets;
CREATE TRIGGER update_atomicassets_template_counts_tr
    AFTER UPDATE OR INSERT OR DELETE ON atomicassets_assets
    FOR EACH ROW
    EXECUTE FUNCTION update_atomicassets_template_counts();
