import { DB } from '../server';
import moize from 'moize';
import { addValidationType, validateString } from './validation';

export async function expandLists(strings: string[], db: DB): Promise<string[]> {
    const result: string[] = [];

    for (const s of strings) {
        if (s.startsWith('$list:')) {
            result.push(...(await getListItems(s.replace(/^\$list:/, ''), db)));
        } else {
            result.push(s);
        }
    }

    return result;
}

const getListItems = moize({
    isPromise: true,
    maxSize: 9999990,
    maxArgs: 1,
    maxAge: 1000 * 60 * 5,
})(async (listName: string, db: DB): Promise<string[]> => {
    const {items} = await db.fetchOne(`
        SELECT ARRAY_AGG(item_name) items
        FROM list_items
            JOIN lists ON list_items.list_id = lists.id
        WHERE lists.list_name = $1
    `, [listName]);

    return items ?? [];
});

export function initListValidator(db: DB): void {
    addValidationType('list', async (values, filter) => {
        const result = await expandLists(values, db);

        return await validateString(result, filter);
    });
}
