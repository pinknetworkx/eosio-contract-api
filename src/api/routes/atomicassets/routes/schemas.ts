import * as express from 'express';

import { AtomicAssetsNamespace } from '../index';
import { WebServer } from '../../../server';

export function schemasEndpoints(core: AtomicAssetsNamespace, web: WebServer, router: express.Router): void {
    router.get('/v1/schemas', ((req, res) => {
        res.json({success: true});
    }));

    router.get('/v1/schemas/:collection_name', ((req, res) => {
        res.json({success: true});
    }));

    router.get('/v1/schemas/:collection_name/:schema_name', ((req, res) => {
        res.json({success: true});
    }));

    router.get('/v1/schemas/:collection_name/:schema_name/logs', ((req, res) => {
        res.json({success: true});
    }));
}
