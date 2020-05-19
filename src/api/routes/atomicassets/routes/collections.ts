import * as express from 'express';

import { AtomicAssetsNamespace } from '../index';
import { WebServer } from '../../../server';

export function collectionsEndpoints(core: AtomicAssetsNamespace, web: WebServer, router: express.Router): void {
    router.get('/v1/collections', ((req, res) => {
        res.json({success: true});
    }));

    router.get('/v1/collections/:collection_name', ((req, res) => {
        res.json({success: true});
    }));

    router.get('/v1/collections/:collection_name/logs', ((req, res) => {
        res.json({success: true});
    }));
}
