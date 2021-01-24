import DataProcessor from './processor';
import { ShipBlock } from '../types/ship';
import { EosioActionTrace, EosioTableRow, EosioTransaction } from '../types/eosio';
import ConnectionManager from '../connections/manager';
import logger from '../utils/winston';

export default class ApiNotificationSender {
    channelName: string;
    notifications: Array<{channel: string, type: string, data: any }>;

    constructor(private readonly connection: ConnectionManager, private readonly processor: DataProcessor, private readonly readerName: string) {
        this.channelName = ['eosio-contract-api', this.connection.chain.name, this.readerName, 'api'].join(':');
        this.notifications = [];

        processor.onCommitted(async () => {
            await this.publish();
        });
    }

    sendTrace(channel: string, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<any>): void {
        this.notifications.push({channel, type: 'trace', data: {block, tx, trace}});
    }

    sendDelta(channel: string, block: ShipBlock, delta: EosioTableRow): void {
        this.notifications.push({channel, type: 'delta', data: {block, delta}});
    }

    sendFork(block: ShipBlock): void {
        this.notifications.push({channel: null, type: 'fork', data: {block}});
    }

    async publish(): Promise<void> {
        const messages = this.notifications;
        this.notifications = [];

        try {
            await this.connection.redis.ioRedis.publish(this.channelName, JSON.stringify(messages));
        } catch (e) {
            logger.warn('Failed to send API notifications', e);
        }
    }
}
