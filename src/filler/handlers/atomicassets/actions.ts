import { ContractDBTransaction } from '../../database';
import { ShipBlock } from '../../../types/ship';
import { EosioActionTrace, EosioTransaction } from '../../../types/eosio';
import AtomicAssetsHandler from './index';

export default class AtomicAssetsActionHandler {
    constructor(readonly core: AtomicAssetsHandler) { }

    async handleTrace(db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace, tx: EosioTransaction): Promise<void> {
        console.log(trace);
    }
}
