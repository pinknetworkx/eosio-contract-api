import { IContractHandler } from '../index';
import { ShipBlock } from '../../../types/ship';
import { EosioAction, EosioActionTrace, EosioTableRow, EosioTransaction } from '../../../types/eosio';
import { ContractDBTransaction } from '../../database';
import ConnectionManager from '../../../connections/manager';
import logger from '../../../utils/winston';
import { PromiseEventHandler } from '../../../utils/event';

export type AtomicMarketArgs = {
    atomicassets_contract: string,
    atomicmarket_contract: string
};

export default class AtomicMarketHandler implements IContractHandler {
    readonly name = 'atomicmarket';

    constructor(
        private readonly connection: ConnectionManager,
        private readonly events: PromiseEventHandler,
        private readonly args: AtomicMarketArgs
    ) { }

    initDB(): void {

    }

    deleteDB(): void {

    }

    init(): void {

    }

    onAction(db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace, tx: EosioTransaction): void {
        logger.debug('atomicmarket', trace);
    }

    onTableChange(db: ContractDBTransaction, block: ShipBlock, delta: EosioTableRow): void {
        logger.debug('atomicmarket', delta);
    }
}
