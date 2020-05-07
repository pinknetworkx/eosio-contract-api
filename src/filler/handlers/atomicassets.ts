import { IContractHandler } from './index';
import { ShipBlock } from '../../types/ship';
import { EosioAction, EosioTableRow } from '../../types/eosio';
import { ContractDBTransaction } from '../database';
import ConnectionManager from '../../connections/manager';
import logger from '../../utils/winston';

export default class AtomicAssetsHandler implements IContractHandler {
    readonly name = 'atomicassets';

    constructor(private readonly connection: ConnectionManager, private readonly args: {}) { }

    initDB(): void {

    }

    deleteDB(): void {

    }

    init(): void {

    }

    onAction(db: ContractDBTransaction, block: ShipBlock, action: EosioAction): void {
        logger.debug('atomicassets', action);
    }

    onTableChange(db: ContractDBTransaction, block: ShipBlock, delta: EosioTableRow): void {
        logger.debug('atomicassets', delta);
    }
}
