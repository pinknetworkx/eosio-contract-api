import * as express from 'express';

import { AtomicMarketNamespace } from '../index';
import { HTTPServer } from '../../../server';

export function salesEndpoints(core: AtomicMarketNamespace, server: HTTPServer, router: express.Router): any {
    router.get('/v1/sales', server.web.caching(), async (req, res) => {

    });

    router.get('/v1/sales/:sale_id', server.web.caching(), async (req, res) => {

    });

    return {
        tag: { },
        paths: { }
    };
}
