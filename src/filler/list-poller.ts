import fetch from 'node-fetch';
import { IListPollConfig } from '../types/config';
import PostgresConnection from '../connections/postgres';
import logger from '../utils/winston';
import moize from 'moize';

const DEFAULT_POLL_FREQUENCY = 60 * 10; // 10 minutes

export default class ListPoller {

    private interval: NodeJS.Timer

    constructor(
        private readonly config: IListPollConfig,
        private readonly database: PostgresConnection,
    ) {

    }

    start(): void {
        logger.info(`Polling lists from ${this.config.url}`);

        this.interval = setInterval(() => {
            this.poll();
        }, (this.config.frequency ?? DEFAULT_POLL_FREQUENCY) * 1000);
    }

    private async poll(): Promise<void> {
        try {
            const response = await fetch(this.config.url, {
                headers: {
                    'X-API-Key': this.config.api_key,
                },
                timeout: 1000 * 60 * 5,
            });

            if (!response.ok) {
                throw new Error(`Invalid response from ${this.config.url}: ${response.status}, ${response.statusText}`);
            }

            const lists = (await response.json()).lists;

            await this.syncListsWithDb(lists as List[]);
        } catch (error) {
            logger.error(error);
        }
    }

    private async syncListsWithDb(lists: List[]): Promise<void> {
        for (const list of lists) {
            await this.syncListWithDb(list);
        }
    }

    private async syncListWithDb(list: List): Promise<void> {
        logger.debug(`polled list ${list.listName} with ${list.items.length} items`);

        const items = list.items.map(item => item.itemName);

        const listId = await getListId(list.listName, this.database);

        const {updated_count} = await this.database.fetchOne(`
            WITH items AS (
                SELECT UNNEST($2::TEXT[]) item_name
            ), insert_new AS (
                INSERT INTO list_items(list_id, item_name)
                    SELECT $1, item_name
                    FROM items
                    EXCEPT
                    SELECT list_id, item_name
                    FROM list_items
                    WHERE list_id = $1
                ON CONFLICT DO NOTHING
                RETURNING 1
            ), delete_old AS (
                DELETE FROM list_items
                WHERE (list_id, item_name) IN (
                    SELECT list_id, item_name
                    FROM list_items
                    WHERE list_id = $1
                    EXCEPT
                    SELECT $1, item_name
                    FROM items
                )
                RETURNING 1
            )
            
            SELECT
                COALESCE((SELECT COUNT(*) FROM insert_new), 0)
                    + COALESCE((SELECT COUNT(*) FROM delete_old), 0) updated_count
        `, [listId, items]);

        logger.debug(`updated ${updated_count} items for list ${list.listName}`);
    }

}

type List = {
    listName: string
    items: ListItem[]
}

type ListItem = {
    itemName: string
}

const getListId = moize({
    isPromise: true,
    maxSize: 9999990,
    maxArgs: 1,
})(async (listName: string, database: PostgresConnection): Promise<number> => {
    return (
        await database.fetchOne(`SELECT id FROM lists WHERE list_name = $1`, [listName])
            ?? await database.fetchOne(`INSERT INTO lists (list_name) VALUES ($1) RETURNING id`, [listName])
    ).id;
});
