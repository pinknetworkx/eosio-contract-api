import * as express from 'express';

import { AtomicHubNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { bearerToken } from '../../authentication/middleware';
import logger from '../../../../utils/winston';
import { sendPushMessage } from '../webpush';

async function getNotifications(
    server: HTTPServer, account: string, limit: number
): Promise<Array<{message: string, reference: any, block_num: string, block_time: string}>> {
    const query = await server.connection.database.query(
        'SELECT message, reference, block_num, block_time ' +
        'FROM atomichub_notifications ' +
        'WHERE account = $1 ORDER BY block_num DESC LIMIT $2',
        [account, limit]
    );

    return query.rows;
}

export function notificationsEndpoints(core: AtomicHubNamespace, server: HTTPServer, router: express.Router): any {
    router.delete('/v1/notifications/:account', bearerToken(core.connection), async (req, res) => {
        try {
            const query = await core.connection.database.query(
                'DELETE FROM atomichub_notifications WHERE account = $1 RETURNING *',
                [req.params.account]
            );

            return res.json({success: true, data: query.rowCount});
        } catch (e) {
            res.status(500).json({success: false, message: 'Database error'});
        }
    });

    router.get('/v1/notifications/:account', async (req, res) => {
        try {
            res.json({success: true, data: await getNotifications(server, req.params.account, 100)});
        } catch (e) {
            res.status(500).json({success: false, message: 'Database error'});
        }
    });

    return {
        tag: {
            name: 'notifications',
            description: 'Notifications'
        },
        paths: { }
    };
}

export function notificationsSockets(core: AtomicHubNamespace, server: HTTPServer): void {
    const namespace = server.socket.io.of(new RegExp('^' + core.path.replace('/', '\\/') + '\\/v1\\/notifications\\/\\d+$'));

    namespace.on('connection', async (socket) => {
        const account = socket.nsp.name.replace(core.path + '/v1/notifications/', '');

        logger.debug('socket notification client connected ' + account);

        let verifiedConnection = false;
        if (!(await server.socket.reserveConnection(socket))) {
            socket.disconnect(true);
        } else {
            verifiedConnection = true;
        }

        socket.join('notification:' + account);

        socket.on('disconnect', async () => {
            if (verifiedConnection) {
                await server.socket.releaseConnection(socket);
            }
        });

        const notifications = getNotifications(server, account, 100);

        socket.emit('init', notifications);
    });

    const atomicassetsChannelName = [
        'eosio-contract-api', core.connection.chain.name, 'atomichub',
        'atomicassets', core.args.atomicassets_contract, 'notifications'
    ].join(':');

    core.connection.redis.ioRedisSub.subscribe(atomicassetsChannelName, () => {
        core.connection.redis.ioRedisSub.on('message', async (channel, message) => {
            if (channel !== atomicassetsChannelName) {
                return;
            }

            const msg = JSON.parse(message);

            namespace.to('notification:' + msg.account).emit('notification', msg.notification);

            await sendPushMessage(core, msg.account, core.args.notification_title, msg.notification.message);
        });
    });

    const atomicmarketChannelName = [
        'eosio-contract-api', core.connection.chain.name, 'atomichub',
        'atomicmarket', core.args.atomicassets_contract, 'notifications'
    ].join(':');

    core.connection.redis.ioRedisSub.subscribe(atomicmarketChannelName, () => {
        core.connection.redis.ioRedisSub.on('message', async (channel, message) => {
            if (channel !== atomicmarketChannelName) {
                return;
            }

            const msg = JSON.parse(message);

            namespace.to('notification:' + msg.account).emit('notification', msg.notification);

            await sendPushMessage(core, msg.account, core.args.notification_title, msg.notification.message);
        });
    });

    const chainChannelName = ['eosio-contract-api', core.connection.chain.name, 'chain'].join(':');
    core.connection.redis.ioRedisSub.subscribe(chainChannelName, () => {
        core.connection.redis.ioRedisSub.on('message', async (channel, message) => {
            if (channel !== chainChannelName) {
                return;
            }

            const msg = JSON.parse(message);

            if (msg.action === 'fork') {
                namespace.emit('fork', {block_num: msg.block_num});
            }
        });
    });
}
