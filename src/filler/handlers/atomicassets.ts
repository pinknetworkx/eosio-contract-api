import { IContractHandler } from './index';
import { ShipBlock } from '../../types/ship';
import { EosioAction } from '../../types/eosio';
import { ContractDBTransaction } from '../database';
import ConnectionManager from '../../connections/manager';

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

    }

    onTableChange(db: ContractDBTransaction, block: ShipBlock, delta: any): void {

    }
}
