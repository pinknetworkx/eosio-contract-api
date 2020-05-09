import ConnectionManager from '../../connections/manager';
import { ShipBlock } from '../../types/ship';
import { EosioActionTrace, EosioTableRow, EosioTransaction } from '../../types/eosio';
import { ContractDBTransaction } from '../database';
import { IContractConfig } from '../../types/config';

import AtomicAssetsHandler from './atomicassets/index';
import AtomicMarketHandler from './atomicmarket/index';
import { PromiseEventHandler } from '../../utils/event';

export interface IContractHandler {
    readonly name: string;

    initDB(): any;
    deleteDB(): any;

    init(): any;
    onAction(db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace, tx: EosioTransaction): any;
    onTableChange(db: ContractDBTransaction, block: ShipBlock, delta: EosioTableRow): any;
}

export default function getHandlers(
    configs: IContractConfig[], connection: ConnectionManager, events: PromiseEventHandler
): IContractHandler[] {
    const handlers = [];

    for (const config of configs) {
        if (config.handler === 'atomicassets') {
            handlers.push(new AtomicAssetsHandler(connection, events, config.args));
        } else if (config.handler === 'atomicmarket') {
            handlers.push(new AtomicMarketHandler(connection, events, config.args));
        } else {
            throw new Error('contract handler not found');
        }
    }

    return handlers;
}
