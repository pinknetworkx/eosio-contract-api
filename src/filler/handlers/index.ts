import ConnectionManager from '../../connections/manager';
import { ShipBlock } from '../../types/ship';
import { EosioAction, EosioTableRow } from '../../types/eosio';
import { ContractDBTransaction } from '../database';
import { IContractConfig } from '../../types/config';

import AtomicAssetsHandler from './atomicassets';
import AtomicMarketHandler from './atomicmarket';

export interface IContractHandler {
    readonly name: string;

    initDB(): any;
    deleteDB(): any;

    init(): any;
    onAction(db: ContractDBTransaction, block: ShipBlock, action: EosioAction): any;
    onTableChange(db: ContractDBTransaction, block: ShipBlock, delta: EosioTableRow): any;
}

export default function getHandlers(configs: IContractConfig[], connection: ConnectionManager): IContractHandler[] {
    const handlers = [];

    for (const config of configs) {
        if (config.handler === 'atomicassets') {
            handlers.push(new AtomicAssetsHandler(connection, config.args));
        } else if (config.handler === 'atomicmarket') {
            handlers.push(new AtomicMarketHandler(connection, config.args));
        } else {
            throw new Error('contract handler not found');
        }
    }

    return handlers;
}
