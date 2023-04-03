import { Client } from 'pg';
import { AsyncFunc, Test } from 'mocha';
import { DB } from '../api/server';
import { RequestValues } from '../api/namespaces/utils';
import { AtomicMarketContext } from '../api/namespaces/atomicmarket';
import { IConnectionsConfig } from '../types/config';
import { initListValidator } from '../api/namespaces/lists';

// eslint-disable-next-line @typescript-eslint/no-var-requires
export const connectionConfig: IConnectionsConfig = require('../../config/connections.config.json');

export class TestClient extends Client implements DB {

    private id: number = 1;

    constructor() {
        super({
            ...connectionConfig.postgres,
            database: `${connectionConfig.postgres.database}-test`,
        });

        // eslint-disable-next-line no-console
        this.connect().catch(console.error);
    }

    getId(): number {
        return ++this.id;
    }

    getName(): string {
        const replacements: Record<string, string> = {
            '6': 'a',
            '7': 'b',
            '8': 'c',
            '9': 'd',
            '0': 'e',
        };
        return `n${String(this.getId()).split('').map(char => replacements[char] ?? char).join('')}`;
    }

    async init(): Promise<void> {}

    async createContractCode(values: Record<string, any> = {}): Promise<Record<string, any>> {
        return await this.insert('contract_codes', {
            account: 'account',
            block_num: this.getId(),
            block_time: this.getId(),
            ...values,
        });
    }

    async createContractReader(values: Record<string, any> = {}): Promise<Record<string, any>> {
        return await this.insert('contract_readers', {
            name: 'test-default',
            block_num: this.getId(),
            block_time: this.getId(),
            live: false,
            updated: this.getId(),
            ...values,
        });
    }

    async createList(values: Record<string, any> = {}): Promise<Record<string, any>> {
        return this.insert('lists', {
            list_name: 'list1',
            ...values,
        });
    }

    async createListItem(values: Record<string, any> = {}): Promise<Record<string, any>> {
        return this.insert('list_items', {
            item_name: 'item1',
            ...values,
        });
    }

    async createFullList(listValues: Record<string, any> = {}, itemValues: Record<string, any> = {}): Promise<Record<string, any>> {
        const list = await this.createList(listValues);

        const listItem = await this.createListItem({
            ...itemValues,
            list_id: list.id,
        });

        return {
            list,
            listItem,
        };
    }

    protected async insert(table: string, data: Record<string, any>): Promise<Record<string, any>> {
        data = data || {};

        const columns = Object.keys(data);

        const columnsSQL = (columns.length ? '('+columns.join(',')+')' : '');
        const valuesSQL = (columns.length ? `VALUES (${columns.map((c, i) => `$${i + 1}`).join(',')})` : 'DEFAULT VALUES');
        const values = columns.map(c => data[c]);

        const sql = `INSERT INTO ${table} ${columnsSQL} ${valuesSQL} RETURNING *`;

        const {rows} = await this.query(sql, values);

        return rows[0];
    }

    async fetchOne<T = any>(queryText: string, values: any[] = []): Promise<T> {
        const {rows} = await this.query(queryText, values);

        return rows[0];
    }

}

export function createTxIt(client: TestClient): any {
    async function runTxTest(fn: () => Promise<void>, self: any): Promise<any> {
        await client.query('BEGIN');

        initListValidator(client);

        try {
            await client.init();

            return await fn.call(self, client);
        } finally {
            await client.query('ROLLBACK');
        }
    }

    const result = function txit(title: string, fn: () => Promise<void>): Test {
        return it(title, async function () {
            return await runTxTest(fn, this);
        });
    };

    result.skip = (title: string, func: () => Promise<void>): Test => it.skip(title, func as unknown as AsyncFunc);

    result.only = function (title: string, fn: () => Promise<void>): Test {

        return it.only(title, async () => {
            return await runTxTest(fn, this);
        });
    };

    return result;
}

export function getTestContext(db: DB, pathParams: RequestValues = {}): AtomicMarketContext {
    return {
        pathParams,
        db,
        coreArgs: {
            atomicmarket_account: 'amtest',
            atomicassets_account: 'aatest',
            delphioracle_account: 'dotest',

            connected_reader: '',

            socket_features: {
                asset_update: false,
            },
        },
    };
}
