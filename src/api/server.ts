import * as express from 'express';
import {Server} from 'socket.io';
import * as http from 'http';

import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';

import * as bodyParser from 'body-parser';
import * as cors from 'cors';
import { Pool, QueryResult } from 'pg';

import ConnectionManager from '../connections/manager';
import { IServerConfig } from '../types/config';
import logger from '../utils/winston';
import { expressRedisCache, ExpressRedisCacheHandler } from '../utils/cache';
import { eosioTimestampToDate } from '../utils/eosio';
import * as swagger from 'swagger-ui-express';
import { getOpenApiDescription, LogSchema } from './docs';
import { respondApiError } from './utils';
import { ActionHandler, ActionHandlerContext } from './actionhandler';
import { ApiNamespace } from './namespaces/interfaces';
import { mergeRequestData } from './namespaces/utils';
import { Send } from 'express-serve-static-core';
import { GetInfoResult } from 'eosjs/dist/eosjs-rpc-interfaces';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const packageJson: any = require('../../package.json');

export interface DB {
    query<T = any>(queryText: string, values?: any[]): Promise<QueryResult<T>>
}

export class HTTPServer implements DB {
    readonly httpServer: http.Server;

    readonly web: WebServer;
    readonly socket: SocketServer;
    readonly docs: DocumentationServer;

    readonly database: Pool;

    constructor(readonly config: IServerConfig, readonly connection: ConnectionManager) {
        this.database = connection.database.createPool({
            statement_timeout: config.max_query_time_ms || 10000,
            max: config.max_db_connections || 50
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
        this.docs = new DocumentationServer(this);
    }

    listen(): void {
        this.httpServer.listen(this.config.server_port || 9000, this.config.server_addr || '0.0.0.0');
    }

    async query<T = any>(queryText: string, values?: any[]): Promise<QueryResult<T>> {
        const startTime = Date.now();

        logger.debug(queryText, values);

        try {
            const result = await this.database.query(queryText, values);
            const duration = Date.now() - startTime;

            if (this.config.slow_query_threshold && duration >= this.config.slow_query_threshold) {
                logger.warn('Query took ' + duration + ' ms', {
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

    readonly limiter: express.Handler;
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

        if (this.server.config.rate_limit) {
            const client = this.server.connection.redis.nodeRedis;

            const store = new RedisStore({
                sendCommand: (...args: string[]): any => client.sendCommand(args),
                prefix: 'eosio-contract-api:' + server.connection.chain.name + ':rate-limit:'
            });

            const keyGenerator = (req: express.Request): string => req.ip;

            this.limiter = rateLimit({
                windowMs: this.server.config.rate_limit.interval * 1000,
                max: this.server.config.rate_limit.requests,

                keyGenerator, store,

                skip: (req: express.Request) => this.server.config.ip_whitelist.indexOf(req.ip) >= 0,
                handler: (req: express.Request, res: express.Response): any => {
                    res.status(429).json({success: false, message: 'Rate limit'});
                },

                legacyHeaders: true,
                standardHeaders: true
            });

            if (this.server.config.rate_limit.bill_execution_time) {
                const limiter = this.limiter;

                this.limiter = async (req: express.Request, res: express.Response, next: express.NextFunction): Promise<void> => {
                    const requestTime = Date.now();

                    const sendFn: Send = res.send.bind(res);

                    res.send = (data): express.Response => {
                        (async (): Promise<void> => {
                            const limitExceeded = Math.ceil((Date.now() - requestTime) / 1000) - 1;
                            const key = keyGenerator(req);

                            for (let i = 0; i < limitExceeded; i++) {
                                await store.increment(key);
                            }
                        })();

                        return sendFn(data);
                    };

                    limiter(req, res, next);
                };
            }
        }

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
        this.express.use(bodyParser.json({limit: '10MB'}));
        this.express.use(bodyParser.urlencoded({ extended: false, limit: '10MB' }));
        this.express.use(cors({allowedHeaders: '*'}));

        this.express.use((req, res, next) => {
            res.setHeader('Access-Control-Allow-Headers', '*');

            logger.debug(req.ip + ': ' + req.method + ' ' + req.originalUrl, req.body);

            next();
        });
    }

    private routes(): void {
        const router = express.Router();

        const running = true;

        let info: GetInfoResult | undefined;

        (async (): Promise<void> => {
            while (running) {
                try {
                    info = await this.server.connection.chain.rpc.get_info();
                } catch (error) {
                    logger.warn('Failed to fetch chain info', error);
                }

                await new Promise(resolve => setTimeout(resolve, 500));
            }
        })();

        const server = this.server;

        async function buildHealthResponse(): Promise<any> {
            let databaseHealth = {status: 'INVALID', readers: <string[]>[]};

            try {
                const query = await server.connection.database.query('SELECT block_num FROM contract_readers');

                if (query.rowCount > 0) {
                    databaseHealth = {status: 'OK', readers: query.rows};
                }
            } catch (e) {
                databaseHealth = {status: 'ERROR', readers: []};
            }

            let chainHealth;

            try {
                if (!info) {
                    chainHealth = {status: 'ERROR', head_block: 0, head_time: 0};
                } else if (Date.now() - 20 * 1000 < new Date(info.head_block_time + '+0000').getTime()) {
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

            return {
                success: true, data: {
                    version: packageJson.version,
                    postgres: databaseHealth,
                    redis: {
                        status: server.connection.redis.ioRedis.status === 'ready' ? 'OK' : 'ERROR'
                    },
                    chain: chainHealth
                }, query_time: Date.now()
            };
        }

        router.get(['/health', '/eosio-contract-api/health'], async (_: express.Request, res: express.Response) => {
            res.json(await buildHealthResponse());
        });

        router.get(['/alive', '/eosio-contract-api/alive'], async (_: express.Request, res: express.Response) => {
            const health = await buildHealthResponse();

            if(!health.success) {
                return res.status(500).send('internal server error');
            }

            if (health.data.chain.head_time <= Date.now() - 30 * 1000) {
                return res.status(500).send('chain api behind for ' + ((Date.now() - health.data.chain.head_time) / 1000) + ' seconds');
            }

            if (health.data.redis.status !== 'OK') {
                return res.status(500).send('redis state: ' + health.data.redis.status);
            }

            if (health.data.postgres.status !== 'OK') {
                return res.status(500).send('postgres state: ' + health.data.postgres.status);
            }

            for (const reader of health.data.postgres.readers) {
                if (reader.block_num <= health.data.chain.head_block - 180) {
                    return res.status(500).send('reader behind for ' + (health.data.chain.head_block - reader.block_num) + ' blocks');
                }
            }

            return res.send('success:' + server.connection.chain.chainId);
        });

        router.get(['/healthc', '/eosio-contract-api/healthc'], async (req, res) => {
            if (await server.connection.alive()) {
                res.status(200).send('success');
            } else {
                res.status(500).send('error');
            }
        });

        router.get(['/timestamp', '/eosio-contract-api/timestamp'], async (_: express.Request, res: express.Response) => {
            res.json({success: true, data: Date.now(), query_time: Date.now()});
        });

        this.express.use(router);
    }

    returnAsJSON = (handler: ActionHandler, core: ApiNamespace): express.Handler => {
        const server = this.server;

        return async (req: express.Request, res: express.Response): Promise<void> => {
            try {
                const params = mergeRequestData(req);
                const pathParams = req.params || {};

                const ctx: ActionHandlerContext<any> = {
                    pathParams,
                    db: server,
                    coreArgs: core.args
                };

                const result = await handler(params, ctx);

                res.json({success: true, data: result, query_time: Date.now()});
            } catch (error) {
                respondApiError(res, error);
            }
        };
    }

}

export class SocketServer {
    readonly io: Server;

    constructor(readonly server: HTTPServer) {
        this.io = new Server(this.server.httpServer, {
            cors: {origin: '*'},
            allowEIO3: true,
            transports: ['websocket']
        });
    }
}

export class DocumentationServer {
    documentation: any;

    constructor(private server: HTTPServer) {
        this.documentation = {
            openapi: '3.0.0',
            info: {
                description: getOpenApiDescription(server),
                version: packageJson.version,
                title: 'EOSIO Contract API'
            },
            servers: [
                {url: 'https://' + server.config.server_name},
                {url: 'http://' + server.config.server_name}
            ],
            tags: [],
            paths: {},
            components: {
                schemas: {
                    'Log': LogSchema
                }
            }
        };
    }

    addTags(data: any[]): void {
        this.documentation.tags.push(...data);
    }

    addPaths(data: any): void {
        Object.assign(this.documentation.paths, data);
    }

    addSchemas(data: any): void {
        Object.assign(this.documentation.components.schemas, data);
    }

    render(): void {
        const router = express.Router();

        router.use('/docs', swagger.serve);
        router.get('/docs', swagger.setup(this.documentation, {
            customCss: '.topbar { display: none; }',
            customCssUrl: 'https://cdn.jsdelivr.net/npm/swagger-ui-themes@3.0.0/themes/3.x/theme-flattop.min.css'
        }));

        this.server.web.express.use(router);
    }
}
