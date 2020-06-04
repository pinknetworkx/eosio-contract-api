import { ContractDBTransaction } from '../../database';
import { ShipBlock } from '../../../types/ship';
import { EosioActionTrace, EosioTransaction } from '../../../types/eosio';
import AtomicHubHandler from './index';

export default class AtomicMarketActionHandler {
    private readonly contractName: string;

    constructor(readonly core: AtomicHubHandler) {
        this.contractName = this.core.args.atomicmarket_account;
    }

    async handleTrace(db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace, tx: EosioTransaction): Promise<void> {

    }

    cleanup() {

    }
}
