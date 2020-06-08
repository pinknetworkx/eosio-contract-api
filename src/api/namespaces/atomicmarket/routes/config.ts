import * as express from 'express';

import { AtomicMarketNamespace } from '../index';
import { HTTPServer } from '../../../server';

export function configEndpoints(core: AtomicMarketNamespace, server: HTTPServer, router: express.Router): any {
    router.get('/v1/config', server.web.caching(), async (req, res) => {

    });

    return {
        tag: { },
        paths: { }
    };
}
