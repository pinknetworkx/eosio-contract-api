import * as express from 'express';

import { AtomicAssetsNamespace } from '../index';
import { WebServer } from '../../../server';
import { getLogs } from '../utils';
import { filterQueryArgs } from '../../utils';
import logger from '../../../../utils/winston';

export function templatesEndpoints(core: AtomicAssetsNamespace, web: WebServer, router: express.Router): void {
    router.get('/v1/templates', (async (req, res) => {
        res.json({success: true});
    }));

    router.get('/v1/templates/:collection_name', (async (req, res) => {
        res.json({success: true});
    }));

    router.get('/v1/templates/:collection_name/:template_id', (async (req, res) => {
        res.json({success: true});
    }));

    router.get('/v1/templates/:collection_name/:template_id/logs', (async (req, res) => {
        const args = filterQueryArgs(req, {
            page: {type: 'int', min: 1, default: 1},
            limit: {type: 'int', min: 1, max: 100, default: 100}
        });

        try {
            res.json({
                success: true,
                data: await getLogs(
                    core.connection.database, core.args.contract, 'template',
                    req.params.collection_name + ':' + req.params.template_id,
                    (args.page - 1) * args.limit, args.limit
                )
            });
        } catch (e) {
            logger.error(e);

            res.json({'success': false});
        }
    }));
}
