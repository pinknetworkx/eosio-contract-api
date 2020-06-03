import * as express from 'express';

import { AtomicHubNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { filterQueryArgs } from '../../utils';
import { AtomicAssetsNamespace } from '../../atomicassets';
import { bearerToken } from '../../authentication/middleware';

export function notificationsEndpoints(core: AtomicHubNamespace, _: HTTPServer, router: express.Router): any {
    router.delete('/v1/notifications/:account', bearerToken(core.connection), async (req, res) => {

    });

    router.get('/v1/notifications/:account', async (req, res) => {

    });

    return {
        tag: {
            name: 'notifications',
            description: 'Notifications'
        },
        paths: { }
    };
}

export function notificationsSockets(core: AtomicAssetsNamespace, server: HTTPServer): void {

}
