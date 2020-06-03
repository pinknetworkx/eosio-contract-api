import * as express from 'express';

import { AtomicHubNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { filterQueryArgs } from '../../utils';

export function webpushEndpoints(core: AtomicHubNamespace, _: HTTPServer, router: express.Router): any {
    router.post('/v1/webpush', async (req, res) => {
        const args = filterQueryArgs(req, {
            account: {type: 'string', min: 1, max: 12},
            url: {type: 'string', min: 1, max: 256},
            public_key: {type: 'string', min: 1, max: 256},
            secret: {type: 'string', min: 1, max: 256}
        }, 'body');

        if (!args.account || !args.url || !args.public_key || !args.secret) {
            return res.status(500).json({success: false, message: 'Invalid data provided'});
        }

        try {
            await core.connection.database.query(
                'INSERT INTO atomichub_browsers (account, url, public_key, secret, created) VALUES ($1, $2, $3, $4, $5)',
                [args.account, args.url, args.public_key, args.secret, Date.now()]
            );

            return res.json({success: true, data: null});
        } catch (e) {
            return res.status(500).json({success: false, message: 'Entry already exists'});
        }
    });

    return {
        tag: {
            name: 'webpush',
            description: 'WebPush'
        },
        paths: { }
    };
}
