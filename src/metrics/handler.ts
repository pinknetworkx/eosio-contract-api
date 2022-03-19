import {Gauge, Registry} from 'prom-client';
import ConnectionManager from '../connections/manager';
import logger from '../utils/winston';

interface Metrics {
    psql_connection: Gauge<any>,
    redis_connection: Gauge<any>,
    psql_pool_clients_total_count: Gauge<any>,
    psql_pool_clients_idle_count: Gauge<any>,
    psql_pool_clients_waiting_count: Gauge<any>,
    readers_blocks_behind_count: Gauge<any>,
    readers_time_behind_chain_sec: Gauge<any>,
}

export class MetricsCollectorHandler {
    private metrics: Metrics;

    constructor(
        private readonly connections: ConnectionManager,
        private readonly process: 'filler' | 'api',
        private readonly hostname: string,
    ) {

    }

    async getMetrics(registry: Registry): Promise<string> {
        this.registerMetrics(registry);

        await Promise.all([
            this.collectPSQlState(),
            this.collectPoolClientsCount(),
            this.collectRedisState(),
            this.collectReadersState()
        ]);

        return registry.metrics();
    }

    private registerMetrics(registry: Registry): void {
        this.metrics = {
            psql_connection: new Gauge({
                name: 'eos_contract_api_sql_live',
                registers: [registry],
                labelNames: ['process', 'hostname'],
                help: 'Indicates if the sql connection is alive, 1 = Alive, 0 = Dead'
            }),
            psql_pool_clients_total_count: new Gauge({
                name: 'eos_contract_api_pool_clients_count',
                registers: [registry],
                labelNames: ['process', 'hostname'],
                help: 'Indicates how many client connections has spawn'
            }),
            psql_pool_clients_waiting_count: new Gauge({
                name: 'eos_contract_api_waiting_pool_clients_count',
                registers: [registry],
                labelNames: ['process', 'hostname'],
                help: 'Indicates how many sql client connections are waiting'
            }),
            psql_pool_clients_idle_count: new Gauge({
                name: 'eos_contract_api_idle_pool_clients_count',
                registers: [registry],
                labelNames: ['process', 'hostname'],
                help: 'Indicates how many sql client connections are idle'
            }),
            readers_blocks_behind_count: new Gauge({
                name: 'eos_contract_api_readers_blocks_behind_count',
                registers: [registry],
                labelNames: ['process', 'hostname', 'filler_name'],
                help: 'Indicates how many blocks is the filler behind the chain'
            }),
            readers_time_behind_chain_sec: new Gauge({
                name: 'eos_contract_api_readers_time_behind_chain_sec',
                registers: [registry],
                labelNames: ['process', 'hostname', 'filler_name'],
                help: 'Indicates how much time in seconds, is the filler behind the chain'
            }),
            redis_connection: new Gauge({
                name: 'eos_contract_api_redis_live',
                registers: [registry],
                labelNames: ['process', 'hostname'],
                help: 'Indicates if the redis connection is alive, 1 = Alive, 0 = Dead'
            }),
        };
    }

    private async collectPSQlState(): Promise<void> {
        try {
            await this.connections.database.query('SELECT 1;');

            this.metrics.psql_connection.labels(this.process, this.hostname).set(1);
        } catch (e) {
            this.metrics.psql_connection.labels(this.process, this.hostname).set(0);
        }
    }

    private async collectPoolClientsCount(): Promise<void> {
        return new Promise((res) => {
            this.metrics.psql_pool_clients_total_count.labels(this.process, this.hostname).set(this.connections.database.pool.totalCount);
            this.metrics.psql_pool_clients_waiting_count.labels(this.process, this.hostname).set(this.connections.database.pool.waitingCount);
            this.metrics.psql_pool_clients_idle_count.labels(this.process, this.hostname).set(this.connections.database.pool.idleCount);
            res();
        });
    }

    private async collectRedisState(): Promise<void> {
        try {
            const res = await this.connections.redis.nodeRedis.ping();
            this.metrics.redis_connection.labels(this.process, this.hostname).set(res === 'PONG' ? 1 : 0);
        } catch (e) {
            this.metrics.redis_connection.labels(this.process, this.hostname).set(0);
        }
    }

    private async collectReadersState(): Promise<void> {
        try {
            const info = await this.connections.chain.rpc.get_info();
            const res = await this.connections.database.query<{ name: string, block_num: string, block_time: string }>('SELECT name, block_num, block_time FROM contract_readers');
            res.rows.forEach(reader => {
                this.metrics.readers_blocks_behind_count.labels(this.process, this.hostname, reader.name).set(info.head_block_num - parseInt(reader.block_num));
                this.metrics.readers_time_behind_chain_sec.labels(this.process, this.hostname, reader.name).set(
                    (Date.now() - parseInt(reader.block_time)) / 1000
                );
            });
        } catch (e) {
            logger.debug('Error reading the readers state', e);
        }
    }
}
