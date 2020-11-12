import { ContractDBTransaction } from '../../database';
import { ShipBlock } from '../../../types/ship';
import { EosioActionTrace, EosioTransaction } from '../../../types/eosio';
import AtomicHubHandler from './index';
import { OfferState } from '../atomicassets';
import logger from '../../../utils/winston';

type TemporaryOffer = { offer_id: string, sender: string, recipient: string };

export default class AtomicAssetsActionHandler {
    private readonly contractName: string;

    constructor(readonly core: AtomicHubHandler) {
        this.contractName = this.core.args.atomicassets_account;

        this.core.events.on('atomicassets_offer_state_change', async ({db, block, contract, offer_id, state}: {
            db: ContractDBTransaction, block: ShipBlock, contract: string, offer_id: string, state: number
        }) => {
            if (this.contractName !== contract) {
                return;
            }

            await this.handleOfferStateChange(db, block, offer_id, state);
        });
    }

    async handleTrace(db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace, tx: EosioTransaction): Promise<void> {
        if (typeof trace.act.data === 'string') {
            throw new Error('AtomicHub: Action was not deserialized properly ' + JSON.stringify({trace, tx}));
        }

        if (['logmint'].indexOf(trace.act.name) >= 0) {
            await this.handleMintAssetTrace(db, block, trace);
        } else if (['transfer'].indexOf(trace.act.name) >= 0) {
            await this.handleTransferTrace(db, block, trace);
        } else if (['lognewoffer'].indexOf(trace.act.name) >= 0) {
            await this.handleNewOfferTrace(db, block, trace);
        }
    }

    async handleOfferStateChange(db: ContractDBTransaction, block: ShipBlock, offerID: string, state: number): Promise<void> {
        const offer = await this.getOffer(db, offerID);

        if (offer === null) {
            logger.error('AtomicHub: Offer state changed but offer not found in database');

            return;
        }

        if (state === OfferState.PENDING.valueOf()) {
            await this.core.createNotification(
                db, block, this.contractName, offer.sender,
                'Your offer #' + offer.offer_id + ' has become valid again after it was invalid.', {type: 'offer', id: offer.offer_id}
            );
        } else if (state === OfferState.INVALID.valueOf()) {
            await this.core.createNotification(
                db, block, this.contractName, offer.sender,
                'Your offer #' + offer.offer_id + ' has become invalid because items are missing.', {type: 'offer', id: offer.offer_id}
            );
        } else if (state === OfferState.ACCEPTED.valueOf()) {
            await this.core.createNotification(
                db, block, this.contractName, offer.sender,
                'Your offer #' + offer.offer_id + ' was accepted.', {type: 'offer', id: offer.offer_id}
            );
        } else if (state === OfferState.DECLINED.valueOf()) {
            await this.core.createNotification(
                db, block, this.contractName, offer.sender,
                'Your offer #' + offer.offer_id + ' was declined.', {type: 'offer', id: offer.offer_id}
            );
        }
    }

    async handleNewOfferTrace(db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace): Promise<void> {
        // @ts-ignore
        const data: TemporaryOffer = trace.act.data;

        await this.core.createNotification(
            db, block, this.contractName, data.recipient,
            'You received a new offer #' + data.offer_id + ' from ' + data.sender + '.', {type: 'offer', id: data.offer_id}
        );
    }

    async handleTransferTrace(db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace): Promise<void> {
        // @ts-ignore
        const data: {'from': string, to: string} = trace.act.data;

        await this.core.createNotification(
            db, block, this.contractName, data.to,
            data.from + ' transferred NFTs to you.', {type: 'transfer', id: null}
        );
    }

    async handleMintAssetTrace(db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace): Promise<void> {
        // @ts-ignore
        const data: {asset_id: string, collection_name: string, new_asset_owner: string} = trace.act.data;

        await this.core.createNotification(
            db, block, this.contractName, data.new_asset_owner,
            'Collection ' + data.collection_name + ' issued an NFT to you.', {type: 'mint', id: data.asset_id}
        );
    }

    private async getOffer(db: ContractDBTransaction, offerID: string): Promise<TemporaryOffer> {
        const query = await db.query(
            'SELECT offer_id, sender, recipient, memo FROM atomicassets_offers WHERE contract = $1 AND offer_id = $2',
            [this.contractName, offerID]
        );

        if (query.rowCount > 0) {
            return query.rows[0];
        }

        return null;
    }
}
