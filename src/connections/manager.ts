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
        this.chain = new ChainApi(config.chain.http);

        this.redis = new RedisConnection(
            config.redis.host,
            config.redis.port
        );

        this.database = new PostgresConnection(
            config.postgres.host,
            config.postgres.port,
            config.postgres.user,
            config.postgres.password,
            config.postgres.database
        );
    }

    createShipBlockReader(options?: IBlockReaderOptions): StateHistoryBlockReader {
        const reader = new StateHistoryBlockReader(this.config.chain.ship);

        if (options) {
            reader.setOptions(options);
        }

        return reader;
    }
}
