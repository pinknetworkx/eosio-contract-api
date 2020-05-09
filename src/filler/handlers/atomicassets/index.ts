import { IContractHandler } from '../index';
import { ShipBlock } from '../../../types/ship';
import { EosioActionTrace, EosioTableRow, EosioTransaction } from '../../../types/eosio';
import { ContractDBTransaction } from '../../database';
import ConnectionManager from '../../../connections/manager';
import logger from '../../../utils/winston';
import { PromiseEventHandler } from '../../../utils/event';

export enum OfferState {
    PENDING = 0
}

export type AtomicAssetsArgs = {
    atomicassets_contract: string
};

export default class AtomicAssetsHandler implements IContractHandler {
    readonly name = 'atomicassets';

    constructor(
        private readonly connection: ConnectionManager,
        private readonly events: PromiseEventHandler,
        private readonly args: AtomicAssetsArgs
    ) { }

    initDB(): void {

    }

    deleteDB(): void {

    }

    init(): void {

    }

    onAction(db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace, tx: EosioTransaction): void {
        logger.debug('atomicassets', {trace, tx});
    }

    onTableChange(db: ContractDBTransaction, block: ShipBlock, delta: EosioTableRow): void {
        logger.debug('atomicassets', delta);
    }
}
