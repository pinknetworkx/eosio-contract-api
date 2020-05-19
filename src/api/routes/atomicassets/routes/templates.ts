import * as express from 'express';

import { AtomicAssetsNamespace } from '../index';
import { WebServer } from '../../../server';

export function templatesEndpoints(core: AtomicAssetsNamespace, web: WebServer, router: express.Router): void {
    router.get('/v1/templates', ((req, res) => {
        res.json({success: true});
    }));

    router.get('/v1/templates/:collection_name', ((req, res) => {
        res.json({success: true});
    }));

    router.get('/v1/templates/:collection_name/:template_name', ((req, res) => {
        res.json({success: true});
    }));

    router.get('/v1/templates/:collection_name/:template_name/logs', ((req, res) => {
        res.json({success: true});
    }));
}
