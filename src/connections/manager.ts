import StateHistoryBlockReader from './ship';
import ChainApi from './chain';
import RedisConnection from './redis';
import PostgresConnection from './postgres';
import { IConnectionsConfig } from '../types/config';
import { IBlockReaderOptions } from '../types/ship';

export default class ConnectionManager {
    readonly chain: ChainApi;
    readonly redis: RedisConnection;
    readonly database: PostgresConnection;

    constructor(private readonly config: IConnectionsConfig) {
        this.chain = new ChainApi(
            process.env.CHAIN_HTTP || config.chain.http,
            process.env.CHAIN_NAME || config.chain.name,
            process.env.CHAIN_ID || config.chain.chain_id
        );

        this.redis = new RedisConnection(
            process.env.REDIS_HOST || config.redis.host,
            parseInt(process.env.REDIS_PORT, 10) || config.redis.port
        );

        this.database = new PostgresConnection(
            process.env.POSTGRES_HOST || config.postgres.host,
            parseInt(process.env.POSTGRES_PORT, 10) || config.postgres.port,
            process.env.POSTGRES_USER || config.postgres.user,
            process.env.POSTGRES_PASSWORD || config.postgres.password,
            process.env.POSTGRES_DATABASE || config.postgres.database
        );
    }

    createShipBlockReader(options?: IBlockReaderOptions): StateHistoryBlockReader {
        const reader = new StateHistoryBlockReader(process.env.CHAIN_SHIP || this.config.chain.ship);

        if (options) {
            reader.setOptions(options);
        }

        return reader;
    }
}
