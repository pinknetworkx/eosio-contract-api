import { Pool, PoolClient, PoolConfig, QueryResult } from 'pg';
// @ts-ignore
import * as exitHook from 'async-exit-hook';
import logger from '../utils/winston';

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

        this.pool.on('error', (err) => {
            logger.warn('PG pool error', err);
        });

        this.name = host + '::' + port + '::' + database;
    }

    async connect(): Promise<void> {
        if (this.initialized) {
            return;
        }

        await this.pool.query('SET search_path TO public');

        this.initialized = true;

        exitHook((callback: () => void) => this.pool.end(callback));
    }

    createPool(args: any): Pool {
        return new Pool({
            ...this.args, ...args
        });
    }

    async query(queryText: string, values: any[] = []): Promise<QueryResult> {
        await this.connect();

        return await this.pool.query(queryText, values);
    }

    async begin(): Promise<PoolClient> {
        await this.connect();

        const client = await this.pool.connect();

        await client.query('BEGIN');

        return client;
    }

    async tableExists(table: string): Promise<boolean> {
        const existsQuery = await this.query(
            'SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2)',
            ['public', table]
        );

        return existsQuery.rows[0].exists;
    }
}
