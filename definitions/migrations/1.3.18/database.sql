DROP TABLE IF EXISTS lists CASCADE;
DROP TABLE IF EXISTS list_items CASCADE;

CREATE TABLE lists (
	id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    list_name TEXT NOT NULL
);

CREATE UNIQUE INDEX lists_list_name ON lists (list_name);

CREATE TABLE list_items (
	id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
	list_id INT NOT NULL,
    item_name TEXT NOT NULL
);

CREATE UNIQUE INDEX list_items_list_id_item_name ON list_items (list_id, item_name);

ALTER TABLE ONLY list_items
    ADD CONSTRAINT list_items_list_id_fkey FOREIGN KEY (list_id) REFERENCES lists(id);




UPDATE dbinfo SET "value" = '1.3.18' WHERE name = 'version';
