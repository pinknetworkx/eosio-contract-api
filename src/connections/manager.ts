import StateHistoryBlockReader from './ship';
import ChainApi from './chain';
import RedisConnection from './redis';
import PostgresConnection from './postgres';
import { IConnectionsConfig } from '../types/config';

export default class ConnectionManager {
    readonly chain: ChainApi;
    readonly redis: RedisConnection;
    readonly database: PostgresConnection;

    constructor(private readonly config: IConnectionsConfig) {
        this.chain = new ChainApi(config.chain.http);

        this.redis = new RedisConnection(
            config.chain.name + '-' + config.redis.prefix,
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

    createShipBlockReader(): StateHistoryBlockReader {
        return new StateHistoryBlockReader(this.config.chain.ship, {
            min_block_confirmation: parseInt(process.env.SHIP_MIN_BLOCK_CONFIRMATION, 10) || 1
        });
    }
}
