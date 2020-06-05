import { ContractDBTransaction } from '../../database';
import { ShipBlock } from '../../../types/ship';
import { EosioActionTrace, EosioTransaction } from '../../../types/eosio';
import AtomicHubHandler from './index';

type TemporaryOffer = { offer_id: string, sender: string, recipient: string };

export default class AtomicAssetsActionHandler {
    private readonly contractName: string;

    private tmpOffers: {[key: string]: TemporaryOffer} = {};

    constructor(readonly core: AtomicHubHandler) {
        this.contractName = this.core.args.atomicassets_account;
    }

    async handleTrace(db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace, tx: EosioTransaction): Promise<void> {
        if (typeof trace.act.data === 'string') {
            throw new Error('AtomicHub: atomicassets actions was not deserialized properly ' + JSON.stringify({trace, tx}));
        }

        if (['logmint'].indexOf(trace.act.name) >= 0) {
            await this.handleMintAssetTrace(db, block, trace);
        } else if (['transfer'].indexOf(trace.act.name) >= 0) {
            await this.handleTransferTrace(db, block, trace);
        } else if (['lognewoffer'].indexOf(trace.act.name) >= 0) {
            await this.handleNewOfferTrace(db, block, trace);
        } else if (['acceptoffer', 'declineoffer', 'canceloffer'].indexOf(trace.act.name) >= 0) {
            await this.handleOfferUpdateTrace(db, block, trace);
        }
    }

    cleanup(): void {
        this.tmpOffers = {};
    }

    async handleNewOfferTrace(db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace): Promise<void> {
        // @ts-ignore
        const data: TemporaryOffer = trace.act.data;

        this.tmpOffers[data.offer_id] = data;

        await this.core.createNotification(
            db, block, this.contractName, data.recipient,
            'You received a new offer #' + data.offer_id + ' from ' + data.sender + '.', {type: 'offer', id: data.offer_id}
        );
    }

    async handleOfferUpdateTrace(db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace): Promise<void> {
        // @ts-ignore
        const data = await this.getOffer(db, trace.act.data.offer_id);

        if (trace.act.name === 'acceptoffer') {
            await this.core.createNotification(
                db, block, this.contractName, data.recipient,
                'Your offer #' + data.offer_id + ' was accepted.', {type: 'offer', id: data.offer_id}
            );
        } else if (trace.act.name === 'declineoffer') {
            await this.core.createNotification(
                db, block, this.contractName, data.recipient,
                'Your offer #' + data.offer_id + ' was declined.', {type: 'offer', id: data.offer_id}
            );
        }
    }

    async handleTransferTrace(db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace): Promise<void> {
        // @ts-ignore
        const data: {'from': string, to: string} = trace.act.data;

        await this.core.createNotification(
            db, block, this.contractName, data.to,
            data.from + ' transferred NFTs to you.', {type: 'transfer'}
        );
    }

    async handleMintAssetTrace(db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace): Promise<void> {
        // @ts-ignore
        const data: {asset_id: string, collection_name: string, new_asset_owner: string} = trace.act.data;

        await this.core.createNotification(
            db, block, this.contractName, data.new_asset_owner,
            'Collection ' + data.collection_name + ' issued a NFT to you.', {type: 'transfer'}
        );
    }

    private async getOffer(db: ContractDBTransaction, offerID: string): Promise<TemporaryOffer> {
        const query = await db.query(
            'SELECT sender, recipient, memo FROM atomicassets_offers WHERE contract = $1 AND offer_id = $2',
            [this.contractName, offerID]
        );

        if (query.rowCount === 0 && this.tmpOffers[offerID]) {
            return this.tmpOffers[offerID];
        }

        if (query.rowCount > 0) {
            return query.rows[0];
        }

        throw new Error('Offer not found');
    }
}
