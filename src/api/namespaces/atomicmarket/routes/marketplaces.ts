import * as express from 'express';

import { AtomicMarketNamespace } from '../index';
import { HTTPServer } from '../../../server';

export function marketplacesEndpoints(core: AtomicMarketNamespace, server: HTTPServer, router: express.Router): any {
    router.get('/v1/marketplaces', server.web.caching(), async (req, res) => {

    });

    router.get('/v1/marketplaces/:name', server.web.caching(), async (req, res) => {

    });

    return {
        tag: { },
        paths: { }
    };
}
