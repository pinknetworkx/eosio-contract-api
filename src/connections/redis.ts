import * as IORedis from 'ioredis';
import * as NodeRedis from 'redis';

export default class RedisConnection {
    readonly ioRedis: IORedis.Redis;
    readonly nodeRedis: NodeRedis.RedisClient;

    constructor(host: string, port: number) {
        this.ioRedis = new IORedis({ host, port });
        this.nodeRedis = NodeRedis.createClient({ host, port });
    }
}
