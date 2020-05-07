import { IContractHandler } from './index';
import { ShipBlock } from '../../types/ship';
import { EosioAction } from '../../types/eosio';
import { ContractDBTransaction } from "../database";
import ConnectionManager from '../../connections/manager';

export default class AtomicMarketHandler implements IContractHandler {
    readonly name = 'atomicmarket';

    constructor(private readonly connection: ConnectionManager, private readonly args: { atomicassets_contract: string }) { }

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
