ALTER TABLE reversible_queries ALTER COLUMN id TYPE BIGINT;

UPDATE dbinfo SET "value" = '1.3.8' WHERE name = 'version';
