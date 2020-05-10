import { ContractHandler } from '../index';
import { ShipBlock } from '../../../types/ship';
import { EosioActionTrace, EosioTableRow, EosioTransaction } from '../../../types/eosio';
import { ContractDBTransaction } from '../../database';

export type AtomicMarketArgs = {
    atomicassets_contract: string,
    atomicmarket_contract: string
};

export default class AtomicAssetsHandler extends ContractHandler {
    static handlerName = 'atomicmarket';
    protected readonly args: AtomicMarketArgs;

    async init(): Promise<void> {

    }

    async deleteDB(): Promise<void> {

    }

    async onAction(db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace, tx: EosioTransaction): Promise<void> {

    }

    async onTableChange(db: ContractDBTransaction, block: ShipBlock, delta: EosioTableRow): Promise<void> {

    }
}
