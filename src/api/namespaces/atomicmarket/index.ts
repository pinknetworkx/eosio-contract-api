import * as express from 'express';

import { ApiNamespace } from '../interfaces';
import { HTTPServer } from '../../server';

export class AtomicMarketNamespace extends ApiNamespace {
    static namespaceName = 'atomicmarket';

    async router(server: HTTPServer): Promise<express.Router> {
        const router = express.Router();

        return router;
    }

    async socket(server: HTTPServer): Promise<void> {

    }

    async init(): Promise<void> {
        return Promise.resolve(undefined);
    }
}
