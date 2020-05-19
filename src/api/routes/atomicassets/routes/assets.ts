import * as express from 'express';

import { AtomicAssetsNamespace } from '../index';
import { WebServer } from '../../../server';

export function assetsEndpoints(core: AtomicAssetsNamespace, web: WebServer, router: express.Router): void {
    router.get('/v1/assets', ((req, res) => {
        res.json({success: true});
    }));

    router.get('/v1/assets/:asset_id', ((req, res) => {
        res.json({success: true});
    }));

    router.get('/v1/assets/:asset_id/logs', ((req, res) => {
        res.json({success: true});
    }));
}
