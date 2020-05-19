import * as express from 'express';

import { AtomicAssetsNamespace } from '../index';
import { WebServer } from '../../../server';

export function configEndpoints(core: AtomicAssetsNamespace, web: WebServer, router: express.Router): void {
    router.get('/v1/config', ((req, res) => {
        res.json({success: true});
    }));
}
