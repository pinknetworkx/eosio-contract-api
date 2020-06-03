import * as express from 'express';

import { AtomicHubNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { filterQueryArgs } from '../../utils';
import { bearerToken } from '../../authentication/middleware';

export function watchlistEndpoints(core: AtomicHubNamespace, _: HTTPServer, router: express.Router): any {
    router.put('/v1/watchlist/:account', bearerToken(core.connection), async (req, res) => {
        const body = filterQueryArgs(req, {
            asset_id: {type: 'int', min: 1}
        }, 'body');

        const params = filterQueryArgs(req, {
            account: {type: 'string', min: 1, max: 12}
        }, 'params');

        if (!params.account || !body.asset_id) {
            return res.status(500).json({success: false, message: 'Input missing'});
        }

        if (req.authorizedAccount !== params.account) {
            return res.status(401).json({success: false, message: 'Unauthorized'});
        }

        try {
            await core.connection.database.query(
                'INSERT INTO atomichub_watchlist (account, contract, asset_id, created) VALUES ($1, $2, $3, $4)',
                [params.account, core.args.atomicassets_contract, body.asset_id, Date.now()]
            );

            return res.json({success: true, data: null});
        } catch (e) {
            return res.json({success: false, message: 'Entry already exists or asset id not found'});
        }
    });

    router.delete('/v1/watchlist/:account', bearerToken(core.connection), async (req, res) => {

    });

    router.get('/v1/watchlist/:account', async (req, res) => {

    });

    return {
        tag: {
            name: 'watchlist',
            description: 'Watchlist'
        },
        paths: { }
    };
}
