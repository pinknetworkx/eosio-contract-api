import AtomicMarketHandler from './index';
import { ContractDBTransaction } from '../../database';
import { ShipBlock } from '../../../types/ship';
import { EosioTableRow } from '../../../types/eosio';
import logger from '../../../utils/winston';

export default class AtomicMarketTableHandler {
    private readonly contractName: string;

    constructor(readonly core: AtomicMarketHandler) {
        this.contractName = this.core.args.atomicassets_account;
    }

    async handleUpdate(db: ContractDBTransaction, block: ShipBlock, delta: EosioTableRow): Promise<void> {
        if (typeof delta.value === 'string') {
            throw new Error('AtomicMarket: Delta of atomicmarket table could not be deserialized: ' + delta.table);
        }

        if (delta.code !== this.core.args.atomicmarket_account) {
            logger.warn('[atomicmarket] Received table delta from wrong contract: ' + delta.code);
        }
    }
}
