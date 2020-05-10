import ConnectionManager from '../../connections/manager';
import { ShipBlock } from '../../types/ship';
import { EosioActionTrace, EosioTableRow, EosioTransaction } from '../../types/eosio';
import { ContractDBTransaction } from '../database';
import { IContractConfig } from '../../types/config';

import AtomicAssetsHandler from './atomicassets/index';
import AtomicMarketHandler from './atomicmarket/index';
import { PromiseEventHandler } from '../../utils/event';

export abstract class ContractHandler {
    static handlerName = '';

    constructor(
        protected readonly connection: ConnectionManager,
        protected readonly events: PromiseEventHandler,
        protected readonly args: {[key: string]: any}
    ) { }

    abstract async init(): Promise<void>;
    abstract async deleteDB(): Promise<void>;

    abstract async onAction(db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace, tx: EosioTransaction): Promise<void>;
    abstract async onTableChange(db: ContractDBTransaction, block: ShipBlock, delta: EosioTableRow): Promise<void>;
}

export default function getHandlers(
    configs: IContractConfig[], connection: ConnectionManager, events: PromiseEventHandler
): ContractHandler[] {
    const handlers = [];

    for (const config of configs) {
        if (config.handler === AtomicAssetsHandler.handlerName) {
            handlers.push(new AtomicAssetsHandler(connection, events, config.args));
        } else if (config.handler === AtomicMarketHandler.handlerName) {
            handlers.push(new AtomicMarketHandler(connection, events, config.args));
        } else {
            throw new Error('contract handler not found');
        }
    }

    return handlers;
}
