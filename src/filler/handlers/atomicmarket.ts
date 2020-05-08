import { IContractHandler } from './index';
import { ShipBlock } from '../../types/ship';
import { EosioAction, EosioTableRow } from '../../types/eosio';
import { ContractDBTransaction } from '../database';
import ConnectionManager from '../../connections/manager';
import logger from '../../utils/winston';

export default class AtomicMarketHandler implements IContractHandler {
    readonly name = 'atomicmarket';

    constructor(
        private readonly connection: ConnectionManager,
        private readonly args: { atomicassets_contract: string, atomicmarket_contract: string }
    ) { }

    initDB(): void {

    }

    deleteDB(): void {

    }

    init(): void {

    }

    onAction(db: ContractDBTransaction, block: ShipBlock, action: EosioAction): void {
        logger.debug('atomicmarket', action);
    }

    onTableChange(db: ContractDBTransaction, block: ShipBlock, delta: EosioTableRow): void {
        logger.debug('atomicmarket', delta);
    }
}
