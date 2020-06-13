import AtomicMarketHandler from './index';
import { ContractDBTransaction } from '../../database';
import { ShipBlock } from '../../../types/ship';
import { EosioActionTrace, EosioTransaction } from '../../../types/eosio';
import logger from '../../../utils/winston';

export default class AtomicMarketActionHandler {
    private readonly contractName: string;

    constructor(readonly core: AtomicMarketHandler) {
        this.contractName = this.core.args.atomicassets_account;
    }

    async handleTrace(db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace, tx: EosioTransaction): Promise<void> {
        if (trace.act.account !== this.core.args.atomicassets_account) {
            logger.error('[atomicmarket] Received action from wrong contract: ' + trace.act.account);

            return;
        }

        if (typeof trace.act.data === 'string') {
            throw new Error('AtomicAssets: Data of atomicassets action could not be deserialized: ' + trace.act.name);
        }
    }
}
