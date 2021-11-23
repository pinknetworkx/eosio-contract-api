import { Client } from 'pg';
import { AsyncFunc, Test } from 'mocha';
import { SaleApiState } from '../api/namespaces/atomicmarket';
import { OfferState } from '../filler/handlers/atomicassets';

async function getTransactionClient(): Promise<TestClient> {
    const client = new TestClient({
        user: 'postgres',
        database: 'atomichub-test',
        // password
        // port
        host: 'localhost',
    });
    await client.connect();
    await client.query('BEGIN');

    return client;
}

export class TestClient extends Client {

    private id: number = 1;

    async init(): Promise<void> {
        await this.createToken();
    }

    async createToken(_: Record<string, any> = {}): Promise<Record<string, any>> {
        return await this.insert('atomicmarket_tokens', {
            market_contract: 'amtest',
            token_contract: 'tctest',
            token_symbol: 'TEST',
            token_precision: 8,
        });
    }

    async createSale(values: Record<string, any> = {}): Promise<Record<string, any>> {
        return await this.insert('atomicmarket_sales', {
            market_contract: 'amtest',
            sale_id: ++this.id,
            seller: 'seller',
            listing_price: 1,
            listing_symbol: 'TEST',
            settlement_symbol: 'TEST',
            assets_contract: 'aatest',
            offer_id: values.offer_id ?? (await this.createOffer()).offer_id,
            maker_marketplace: '',
            collection_name: values.collection_name ?? (await this.createCollection()).collection_name,
            collection_fee: 0,
            state: SaleApiState.LISTED,
            updated_at_block: ++this.id,
            updated_at_time: ++this.id,
            created_at_block: ++this.id,
            created_at_time: ++this.id,
            ...values,
        });
    }

    async createAsset(values: Record<string, any> = {}): Promise<Record<string, any>> {
        return await this.insert('atomicassets_assets', {
            contract: 'aatest',
            asset_id: ++this.id,
            collection_name: values.collection_name ?? (await this.createCollection()).collection_name,
            schema_name: 'schema_name',
            transferred_at_block: ++this.id,
            transferred_at_time: ++this.id,
            updated_at_block: ++this.id,
            updated_at_time: ++this.id,
            minted_at_block: ++this.id,
            minted_at_time: ++this.id,
            ...values,
        });
    }

    async createOfferAsset(values: Record<string, any> = {}): Promise<Record<string, any>> {
        return await this.insert('atomicassets_offers_assets', {
            contract: 'aatest',
            offer_id: values.offer_id ?? (await this.createOffer()).offer_id,
            owner: 'owner',
            index: 0,
            asset_id: values.asset_id ?? (await this.createAsset()).asset_id,
            ...values,
        });
    }

    async createOffer(values: Record<string, any> = {}): Promise<Record<string, any>> {
        return await this.insert('atomicassets_offers', {
            contract: 'aatest',
            offer_id: ++this.id,
            sender: 'sender',
            recipient: 'recipient',
            memo: 'memo',
            state: OfferState.PENDING,
            updated_at_block: ++this.id,
            updated_at_time: ++this.id,
            created_at_block: ++this.id,
            created_at_time: ++this.id,
            ...values,
        });
    }

    async createCollection(values: Record<string, any> = {}): Promise<Record<string, any>> {
        return await this.insert('atomicassets_collections', {
            contract: 'aatest',
            collection_name: `${++this.id}`,
            author: 'author',
            allow_notify: false,
            authorized_accounts: [],
            notify_accounts: [],
            market_fee: 0,
            data: JSON.stringify({name: 'test'}),
            created_at_block: ++this.id,
            created_at_time: ++this.id,
            ...values,
        });
    }

    private async insert(table: string, data: Record<string, any>): Promise<Record<string, any>> {
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

export function txit(title: string, fn: (client: TestClient) => Promise<void>): Test {

    return it(title, async function () {
        const client = await getTransactionClient();

        try {
            await client.init();

            return await fn.call(this, client);
        } finally {
            await client.query('ROLLBACK');
        }
    });
}

txit.skip = (title: string, func: (client: TestClient) => Promise<void>): Test => it.skip(title, func as unknown as AsyncFunc);

txit.only = function (title: string, fn: (client: TestClient) => Promise<void>): Test {

    return it.only(title, async () => {
        const client = await getTransactionClient();

        try {
            await client.init();

            return await fn.call(this, client);
        } finally {
            await client.query('ROLLBACK');
        }
    });
};
