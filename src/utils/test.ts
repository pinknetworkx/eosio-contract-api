import { Client } from 'pg';
import { AsyncFunc, Test } from 'mocha';
import { DB } from '../api/server';
import { RequestValues } from '../api/namespaces/utils';
import { AtomicMarketContext } from '../api/namespaces/atomicmarket';
import { IConnectionsConfig } from '../types/config';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const connectionConfig: IConnectionsConfig = require('../../config/connections.config.json');

export class TestClient extends Client {

    private id: number = 1;

    constructor() {
        super({
            ...connectionConfig.postgres,
            database: `${connectionConfig.postgres.database}-test`,
        });

        this.connect().catch(console.error);
    }

    getId(): number {
        return ++this.id;
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

}

export function createTxIt(client: TestClient): any {
    async function runTxTest(fn: () => Promise<void>, self: any): Promise<any> {
        await client.query('BEGIN');

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
