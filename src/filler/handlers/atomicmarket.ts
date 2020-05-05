import { IContractHandler } from './index';
import { ShipBlock } from '../../types/ship';
import { EosioAction } from '../../types/eosio';
import { ContractDBTransaction } from "../database";

export default class AtomicMarketHandler implements IContractHandler {
    onAction(db: ContractDBTransaction, block: ShipBlock, action: EosioAction): any {

    }

    onTableChange(db: ContractDBTransaction, block: ShipBlock, delta: any): any {

    }
}
