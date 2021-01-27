import { NotificationData } from '../filler/notifier';
import ConnectionManager from '../connections/manager';
import logger from '../utils/winston';

export type NotificationListener = (notifications: NotificationData[]) => Promise<any>;

export default class ApiNotificationReceiver {
    private readonly channelName: string;
    private readonly listeners: Array<{channel: string, callback: NotificationListener}>

    constructor(readonly connection: ConnectionManager, readonly readerName: string) {
        this.channelName = ['eosio-contract-api', this.connection.chain.name, this.readerName, 'api'].join(':');
        this.listeners = [];

        this.startListening();
    }

    startListening(): void {
        this.connection.redis.ioRedisSub.setMaxListeners(this.connection.redis.ioRedisSub.getMaxListeners() + 1);
        this.connection.redis.ioRedisSub.subscribe(this.channelName, () => {
            this.connection.redis.ioRedisSub.on('message', async (channel, message) => {
                if (channel !== this.channelName) {
                    return;
                }

                const notifications: NotificationData[] = JSON.parse(message);
                const promises = [];

                logger.debug('received api notifications', notifications);

                for (const listener of this.listeners) {
                    const filteredNotifications = notifications.filter(row => row.channel === listener.channel || !row.channel);

                    if (filteredNotifications.length === 0) {
                        continue;
                    }

                    promises.push(listener.callback(filteredNotifications));
                }

                await Promise.all(promises);
            });
        });
    }

    onData(channel: string, listener: NotificationListener): () => void {
        const element = {channel, callback: listener};

        this.listeners.push(element);

        return (): void => {
            const index = this.listeners.indexOf(element);

            if (index >= 0) {
                this.listeners.splice(index, 1);
            }
        };
    }
}


