import { ContractDBTransaction } from '../../database';
import { ShipBlock } from '../../../types/ship';
import { EosioActionTrace, EosioTransaction } from '../../../types/eosio';
import AtomicHubHandler from './index';
import { AcceptOfferActionData, CancelOfferActionData, DeclineOfferActionData } from '../atomicassets/types/actions';
import { OffersTableRow } from '../atomicassets/types/tables';

export default class AtomicAssetsActionHandler {
    private readonly contractName: string;

    private tmpOffers: OffersTableRow[] = [];

    constructor(readonly core: AtomicHubHandler) {
        this.contractName = this.core.args.atomicassets_account;
    }

    async handleTrace(db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace, tx: EosioTransaction): Promise<void> {
        if (['mintasset'].indexOf(trace.act.name) >= 0) {
            await this.handleMintAssetTrace(db, block, trace, tx);
        } else if (['transfer'].indexOf(trace.act.name) >= 0) {
            await this.handleTransferTrace(db, block, trace, tx);
        } else if (['createoffer'].indexOf(trace.act.name) >= 0) {
            await this.handleNewOfferTrace(db, block, trace, tx);
        } else if (['acceptoffer', 'declineoffer', 'canceloffer'].indexOf(trace.act.name) >= 0) {
            await this.handleOfferUpdateTrace(db, block, trace, tx);
        }
    }

    cleanup(): void {
        this.tmpOffers = [];
    }

    async handleNewOfferTrace(
        db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace, tx: EosioTransaction
    ): Promise<void> {

    }

    async handleOfferUpdateTrace(
        db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace, tx: EosioTransaction
    ): Promise<void> {
        if (trace.act.name === 'acceptoffer') {
            // @ts-ignore
            const data: AcceptOfferActionData = trace.act.data;

        } else if (trace.act.name === 'declineoffer') {
            // @ts-ignore
            const data: DeclineOfferActionData = trace.act.data;

        } else if (trace.act.name === 'canceloffer') {
            // @ts-ignore
            const data: CancelOfferActionData = trace.act.data;
        }
    }

    async handleTransferTrace(
        db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace, tx: EosioTransaction
    ): Promise<void> {

    }

    async handleMintAssetTrace(
        db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace, tx: EosioTransaction
    ): Promise<void> {

    }
}
