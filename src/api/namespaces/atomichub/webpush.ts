import * as webpush from 'web-push';

import { AtomicHubNamespace } from './index';

export async function sendPushMessage(core: AtomicHubNamespace, account: string, title: string, body: string) {
    webpush.setVapidDetails('', core.args.vapid_keys.public, core.args.vapid_keys.private);

    const query = await core.connection.database.query(
        'SELECT id, url, public_key, secret FROM atomichub_browsers WHERE account = $1',
        [account]
    );

    const promises = [];
    for (const subscription of query.rows) {
        const promise = webpush.sendNotification({
            'endpoint': subscription.url,
            'keys': {
                'p256dh': subscription.public_key,
                'auth': subscription.secret
            }
        }, JSON.stringify({title, body}));

        promise.catch(async (error) => {
            const invalidErrors = [102, 401, 410];

            if (invalidErrors.indexOf(error.statusCode) >= 0) {
                await core.connection.database.query('DELETE FROM atomichub_browsers WHERE id = $1', [subscription.id]);
            }
        });

        promises.push(promise);
    }

    await Promise.allSettled(promises);
}
