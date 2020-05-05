import { Pool } from 'pg';

export default class PostgresConnection {
    private pool: Pool;

    constructor(host: string, port: number, user: string, password: string, database: string) {
        this.pool = new Pool({ host, port, user, password, database });
    }

    async query(queryText: string, values: any[] = []) {
        return await this.pool.query(queryText, values);
    }

    async begin() {
        const client = await this.pool.connect();

        await client.query('BEGIN');

        return client;
    }
}
