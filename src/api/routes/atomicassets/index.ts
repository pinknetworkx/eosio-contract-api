import * as express from 'express';

import { ApiNamespace } from '../interfaces';
import { SocketServer, WebServer } from '../../server';
import { assetsEndpoints } from './routes/assets';
import { collectionsEndpoints } from './routes/collections';
import { configEndpoints } from './routes/config';
import { offersEndpoints } from './routes/offers';
import { schemasEndpoints } from './routes/schemas';
import { templatesEndpoints } from './routes/templates';

export class AtomicAssetsNamespace extends ApiNamespace {
    static namespaceName = 'atomicassets';

    async router(web: WebServer): Promise<express.Router> {
        const router = express.Router();

        assetsEndpoints(this, web, router);
        collectionsEndpoints(this, web, router);
        configEndpoints(this, web, router);
        offersEndpoints(this, web, router);
        schemasEndpoints(this, web, router);
        templatesEndpoints(this, web, router);

        return router;
    }

    async socket(socket: SocketServer): Promise<void> {

    }
}
