import * as express from 'express';

import { AtomicAssetsNamespace } from '../index';
import { WebServer } from '../../../server';
import { serializeEosioName } from '../../../../utils/eosio';
import logger from '../../../../utils/winston';

export function configEndpoints(core: AtomicAssetsNamespace, web: WebServer, router: express.Router): void {
    router.get('/v1/config', (async (req, res) => {
        try {
            const query = await core.connection.database.query(
                'SELECT * FROM atomicassets_config WHERE contract = $1',
                [serializeEosioName(core.args.contract)]
            );

            if (query.rowCount === 0) {
                res.status(500);

                return res.json({success: false, message: 'Config not found'});
            }

            return res.json({success: true, data: {
                contract: core.args.contract,
                version: query.rows[0].version,
                collection_format: query.rows[0].collection_format
            }});
        } catch (e) {
            logger.error(e);

            res.status(500);
            return res.json({success: false, message: 'Internal Server Error'});
        }
    }));
}
