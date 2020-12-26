import * as express from 'express';
import * as socketio from 'socket.io';
import * as http from 'http';
import * as path from 'path';

import * as expressRateLimit from 'express-rate-limit';
import * as expressRedisStore from 'rate-limit-redis';
import { Namespace } from 'socket.io';

import * as bodyParser from 'body-parser';
import * as cors from 'cors';
import * as cookieParser from 'cookie-parser';
import { Pool, QueryResult } from 'pg';

import ConnectionManager from '../connections/manager';
import { IServerConfig } from '../types/config';
import logger from '../utils/winston';
import { expressRedisCache, ExpressRedisCacheHandler } from '../utils/cache';
import { eosioTimestampToDate } from '../utils/eosio';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const packageJson: any = require('../../package.json');

export class HTTPServer {
    readonly httpServer: http.Server;

    readonly web: WebServer;
    readonly socket: SocketServer;

    readonly database: Pool;

    constructor(readonly config: IServerConfig, readonly connection: ConnectionManager) {
        this.database = connection.database.createPool({
            statement_timeout: 15000
        });
        this.web = new WebServer(this);

        this.httpServer = http.createServer(this.web.express);

        this.httpServer.on('error', (error: NodeJS.ErrnoException) => {
            logger.error(error);
        });

        this.httpServer.on('listening', () => {
            const addr = this.httpServer.address();
            const bind = typeof addr === 'string'
                ? 'pipe ' + addr
                : 'port ' + addr.port;

            logger.info('Listening on ' + bind);
        });

        this.socket = new SocketServer(this);
    }

    listen(): void {
        this.httpServer.listen(this.config.server_port, this.config.server_addr);
    }

    async query(queryText: string, values?: any[]): Promise<QueryResult> {
        const startTime = Date.now();

        logger.debug(queryText, values);

        try {
            const result = await this.database.query(queryText, values);
            const duration = Date.now() - startTime;

            if (this.config.slow_query_threshold && duration >= this.config.slow_query_threshold) {
                logger.warn('Query took longer than ' + duration + ' ms', {
                    queryText, values
                });
            }

            return result;
        } catch (error) {
            logger.warn('Query exception', {
                message: String(error), error, queryText, values
            });

            throw error;
        }
    }
}

export class WebServer {
    readonly express: express.Application;

    readonly limiter: expressRateLimit.RateLimit;
    readonly caching: ExpressRedisCacheHandler;

    constructor(readonly server: HTTPServer) {
        this.express = express();

        if (this.server.config.trust_proxy) {
            this.express.set('trust proxy', 1);
        }

        this.express.set('etag', false);
        this.express.set('x-powered-by', false);

        this.express.use(((req, res, next) => {
            res.setHeader('Last-Modified', (new Date()).toUTCString());
            next();
        }));

        this.limiter = expressRateLimit({
            windowMs: this.server.config.rate_limit.interval * 1000,
            max: this.server.config.rate_limit.requests,
            handler: (req: express.Request, res: express.Response, next: express.NextFunction): any => {
                if (this.server.config.ip_whitelist.indexOf(req.ip) >= 0) {
                    return next();
                }

                res.status(429).json({success: false, message: 'Rate limit'});
            },
            keyGenerator(req: express.Request): string {
                return req.ip;
            },
            store: new expressRedisStore({
                client: this.server.connection.redis.nodeRedis,
                prefix: 'eosio-contract-api:' + server.connection.chain.name + ':rate-limit:',
                expiry: this.server.config.rate_limit.interval
            })
        });

        this.caching = expressRedisCache(
            this.server.connection.redis.nodeRedis,
            'eosio-contract-api:' + this.server.connection.chain.name + ':express-cache:',
            this.server.config.cache_life || 0,
            this.server.config.ip_whitelist || []
        );

        this.middleware();
        this.routes();
    }

    private middleware(): void {
        this.express.use(bodyParser.json());
        this.express.use(bodyParser.urlencoded({ extended: false }));
        this.express.use(cookieParser());
        this.express.use(cors());

        this.express.use((req, _, next) => {
            logger.debug(req.ip + ': ' + req.method + ' ' + req.originalUrl, req.body);

            next();
        });
    }

    private routes(): void {
        const router = express.Router();

        let infoRequest = this.server.connection.chain.rpc.get_info();

        setInterval(() => {
            infoRequest = this.server.connection.chain.rpc.get_info();
        }, 500);

        router.get(['/health', '/eosio-contract-api/health'], async (_: express.Request, res: express.Response) => {
            let databaseHealth = {status: 'INVALID', readers: <string[]>[]};

            try {
                const query = await this.server.connection.database.query('SELECT block_num FROM contract_readers');

                if (query.rowCount > 0) {
                    databaseHealth = {status: 'OK', readers: query.rows};
                }
            } catch (e) {
                databaseHealth = {status: 'ERROR', readers: []};
            }

            let chainHealth;

            try {
                const info = await infoRequest;

                if (Date.now() - 20 * 1000 < new Date(info.head_block_time + '+0000').getTime()) {
                    chainHealth = {
                        status: 'OK',
                        head_block: info.head_block_num,
                        head_time: eosioTimestampToDate(info.head_block_time).getTime()
                    };
                } else {
                    chainHealth = {
                        status: 'ERROR',
                        head_block: info.head_block_num,
                        head_time: eosioTimestampToDate(info.head_block_time).getTime()
                    };
                }
            } catch (e) {
                chainHealth = {status: 'ERROR', head_block: 0, head_time: 0};
            }

            res.json({
                success: true, data: {
                    version: packageJson.version,
                    postgres: databaseHealth,
                    redis: {
                        status: this.server.connection.redis.ioRedis.status === 'ready' ? 'OK' : 'ERROR'
                    },
                    chain: chainHealth
                }, query_time: Date.now()
            });
        });

        router.get(['/eosio-contract-api/timestamp'], async (_: express.Request, res: express.Response) => {
            res.json({success: true, data: Date.now(), query_time: Date.now()});
        });

        router.use('/docs/assets', express.static(path.resolve(__dirname, '../../docs/assets')));

        this.express.use(router);
    }
}

export class SocketServer {
    readonly io: socketio.Server;

    constructor(readonly server: HTTPServer) {
        this.io = socketio(this.server.httpServer, {
            origins: '*:*'
        });

        this.init().then();
    }

    async init(): Promise<void> {
        const pattern = ['eosio-contract-api', this.server.connection.chain.name, 'socket-connections', '*'].join(':');
        const keys = await this.server.connection.redis.ioRedis.keys(pattern);

        const pipeline = this.server.connection.redis.ioRedis.pipeline();

        for (const key of keys) {
            pipeline.del(key);
        }

        await pipeline.exec();
    }

    async reserveConnection(socket: socketio.Socket): Promise<boolean> {
        let ip;
        if (this.server.config.trust_proxy && socket.handshake.headers['x-forwarded-for']) {
            ip = socket.handshake.headers['x-forwarded-for'].split(',')[0];
        } else {
            ip = socket.conn.remoteAddress;
        }

        logger.debug('reserve socket connection for ' + ip);

        const key = ['eosio-contract-api', this.server.connection.chain.name, 'socket-connections', ip].join(':');
        const connections = parseInt(await this.server.connection.redis.ioRedis.get(key), 10);

        if (isNaN(connections) || connections < this.server.config.socket_limit.connections_per_ip) {
            await this.server.connection.redis.ioRedis.incr(key);

            return true;
        }

        return false;
    }

    async releaseConnection(socket: socketio.Socket): Promise<void> {
        let ip;
        if (this.server.config.trust_proxy) {
            ip = socket.handshake.headers['x-forwarded-for'].split(',')[0];
        } else {
            ip = socket.conn.remoteAddress;
        }

        const key = ['eosio-contract-api', this.server.connection.chain.name, 'socket-connections', ip].join(':');

        await this.server.connection.redis.ioRedis.decr(key);
    }

    addForkSubscription(reader: string, namespace: Namespace): void {
        const chainChannelName = [
            'eosio-contract-api', this.server.connection.chain.name, reader, 'chain'
        ].join(':');

        this.server.connection.redis.ioRedisSub.setMaxListeners(this.server.connection.redis.ioRedisSub.getMaxListeners() + 1);

        this.server.connection.redis.ioRedisSub.subscribe(chainChannelName, () => {
            this.server.connection.redis.ioRedisSub.on('message', async (channel, message) => {
                if (channel !== chainChannelName) {
                    return;
                }

                const msg = JSON.parse(message);

                if (msg.action === 'fork') {
                    namespace.emit('fork', {block_num: msg.block_num});
                }
            });
        });
    }
}
