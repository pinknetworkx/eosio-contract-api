import { ContractDBTransaction } from '../../database';
import { ShipBlock } from '../../../types/ship';
import { EosioTableRow } from '../../../types/eosio';
import AtomicAssetsHandler from './index';

export default class AtomicAssetsTableHandler {
    constructor(readonly core: AtomicAssetsHandler) { }

    async handleUpdate(db: ContractDBTransaction, block: ShipBlock, delta: EosioTableRow) {
        console.log(delta);
    }
}
