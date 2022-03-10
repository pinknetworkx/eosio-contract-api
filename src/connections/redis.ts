import * as IORedis from 'ioredis';
import { createClient, RedisClientType } from 'redis';

export default class RedisConnection {
    readonly ioRedis: IORedis.Redis;
    readonly ioRedisSub: IORedis.Redis;

    readonly nodeRedis: RedisClientType<any, any>;
    readonly nodeRedisSub: RedisClientType<any, any>;

    private initialized = false;

    constructor(host: string, port: number) {
        this.ioRedis = new IORedis({ host, port });
        this.ioRedisSub = new IORedis({ host, port });

        this.nodeRedis = createClient({ url: `redis://${host}:${port}` });
        this.nodeRedisSub = createClient({ url: `redis://${host}:${port}` });
    }

    async connect(): Promise<void> {
        if (this.initialized) {
            return;
        }

        await this.nodeRedis.connect();
        await this.nodeRedisSub.connect();

        this.initialized = true;
    }

    async disconnect(): Promise<void> {
        if (this.nodeRedis.isOpen) {
            await this.nodeRedis.disconnect();
        }
        if (this.nodeRedisSub.isOpen) {
            await this.nodeRedisSub.disconnect();
        }

        await this.ioRedis.disconnect();
        await this.ioRedisSub.disconnect();
    }

}
