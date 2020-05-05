import { ShipBlock } from '../../types/ship';
import { EosioAction } from '../../types/eosio';
import { ContractDBTransaction } from '../database';

import AtomicAssetsHandler from './atomicassets';
import AtomicMarketHandler from './atomicmarket';

export interface IContractHandler {
    onAction(db: ContractDBTransaction, block: ShipBlock, action: EosioAction): any;
    onTableChange(db: ContractDBTransaction, block: ShipBlock, delta: any): any;
}

export default function getHandlers(): {[key: string]: IContractHandler} {
    return {
        atomicassets: new AtomicAssetsHandler(),
        atomicmarket: new AtomicMarketHandler()
    };
};
