import * as express from 'express';

import { AtomicMarketNamespace } from '../index';
import { HTTPServer } from '../../../server';

export function auctionsEndpoints(core: AtomicMarketNamespace, server: HTTPServer, router: express.Router): any {
    router.get('/v1/auctions', server.web.caching(), async (req, res) => {

    });

    router.get('/v1/auctions/:auction_id', server.web.caching(), async (req, res) => {

    });

    return {
        tag: { },
        paths: { }
    };
}
