import * as express from 'express';

import { ApiNamespace } from '../interfaces';
import { SocketServer, WebServer } from '../../server';

export class AtomicMarketNamespace extends ApiNamespace {
    static namespaceName = 'atomicmarket';

    async router(web: WebServer): Promise<express.Router> {
        const router = express.Router();

        return router;
    }

    async socket(socket: SocketServer): Promise<void> {

    }

    async init(): Promise<void> {
        return Promise.resolve(undefined);
    }
}
