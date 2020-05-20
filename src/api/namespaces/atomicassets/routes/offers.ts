import * as express from 'express';

import { AtomicAssetsNamespace } from '../index';
import { WebServer } from '../../../server';

export function offersEndpoints(core: AtomicAssetsNamespace, web: WebServer, router: express.Router): void {
    router.get('/v1/offers', ((req, res) => {
        res.json({success: true});
    }));

    router.get('/v1/offers/:offer_id', ((req, res) => {
        res.json({success: true});
    }));
}
