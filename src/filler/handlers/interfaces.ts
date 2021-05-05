import { PoolClient } from 'pg';

import ConnectionManager from '../../connections/manager';
import DataProcessor from '../processor';
import ApiNotificationSender from '../notifier';
import Filler from '../filler';

export type ContractHandlerScope = {[key: string]: Array<{ filter: string, deserialize: boolean }>};

export abstract class ContractHandler {
    static handlerName = '';

    readonly connection: ConnectionManager;

    static async setup(_client: PoolClient): Promise<boolean> {
        return false;
    }

    static async upgrade(_client: PoolClient, _version: string): Promise<void> {
        return;
    }

    protected constructor(
        readonly filler: Filler,
        readonly args: {[key: string]: any}
    ) {
        this.connection = filler.connection;
    }

    getName(): string {
        return ContractHandler.handlerName;
    }

    abstract init(transaction: PoolClient): Promise<void>;
    abstract deleteDB(transaction: PoolClient): Promise<void>;

    abstract register(processor: DataProcessor, notifier: ApiNotificationSender): Promise<() => any>;
}
