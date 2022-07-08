DELETE FROM dbinfo WHERE name = 'vacuum_settings';

UPDATE dbinfo SET "value" = '1.3.16' WHERE name = 'version';
