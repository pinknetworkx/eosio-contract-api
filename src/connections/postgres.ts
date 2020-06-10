import { Pool, PoolClient, QueryResult } from 'pg';

export default class PostgresConnection {
    readonly pool: Pool;

    private initialized = false;

    constructor(host: string, port: number, user: string, password: string, database: string) {
        this.pool = new Pool({ host, port, user, password, database });
    }

    async init(): Promise<void> {
        if (this.initialized) {
            return;
        }

        await this.pool.query('SET search_path TO public');
        this.initialized = true;
    }

    async query(queryText: string, values: any[] = []): Promise<QueryResult> {
        await this.init();

        return await this.pool.query(queryText, values);
    }

    async begin(): Promise<PoolClient> {
        await this.init();

        const client = await this.pool.connect();

        await client.query('BEGIN');

        return client;
    }

    async schema(): Promise<string> {
        return 'public';
    }
}
