import { Pool, PoolClient, PoolConfig, QueryResult } from 'pg';

export default class PostgresConnection {
    readonly pool: Pool;
    readonly name: string;

    private readonly args: PoolConfig;
    private initialized = false;

    constructor(host: string, port: number, user: string, password: string, database: string) {
        this.args = {
            host, port, user, password, database,
            application_name: 'eosio-contract-api'
        };
        this.pool = new Pool(this.args);

        this.name = host + '::' + port + '::' + database;
    }

    async init(): Promise<void> {
        if (this.initialized) {
            return;
        }

        await this.pool.query('SET search_path TO public');
        this.initialized = true;
    }

    createPool(args: any): Pool {
        return new Pool({
            ...this.args, ...args
        });
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

    async tableExists(table: string): Promise<boolean> {
        const existsQuery = await this.query(
            'SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2)',
            [await this.schema(), table]
        );

        return existsQuery.rows[0].exists;
    }
}
