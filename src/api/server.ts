import * as express from 'express';
import * as socketio from 'socket.io';
import * as http from 'http';

import * as bodyParser from 'body-parser';
import * as cors from 'cors';
import * as cookieParser from 'cookie-parser';
import * as redisAdapter from 'socket.io-redis';

import ConnectionManager from '../connections/manager';
import { IServerConfig } from '../types/config';
import logger from '../utils/winston';

export class HTTPServer {
    readonly httpServer: http.Server;

    readonly web: WebServer;
    readonly socket: SocketServer;

    constructor(readonly config: IServerConfig, readonly connections: ConnectionManager) {
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
}

export class WebServer {
    readonly express: express.Application;

    constructor(readonly server: HTTPServer) {
        this.express = express();

        this.middleware();
        this.routes();
    }

    private middleware(): void {
        this.express.use(bodyParser.json());
        this.express.use(bodyParser.urlencoded({ extended: false }));
        this.express.use(cookieParser());
        this.express.use(cors());

        this.express.use((req, _, next) => {
            logger.debug(req.method + ' ' + req.url, req.body);

            next();
        });
    }

    private routes(): void {
        const router = express.Router();

        router.get('/health', (_: express.Request, res: express.Response) => {
            res.json({
                success: true, data: {db: 'true'}
            });
        });

        this.express.use(router);
    }
}

export class SocketServer {
    readonly io: socketio.Server;

    constructor(readonly server: HTTPServer) {
        this.io = socketio(this.server.httpServer, {
            origins: '*:*'
        });

        this.adapter();
        this.routes();
    }

    private adapter(): void {
        this.io.adapter(redisAdapter({
            key: this.server.connections.chain.name + ':' + this.server.config.socket_prefix,
            pubClient: this.server.connections.redis.conn,
            subClient: this.server.connections.redis.conn
        }));
    }

    private routes(): void { }
}
