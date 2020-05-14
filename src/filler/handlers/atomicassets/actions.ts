import { ContractDBTransaction } from '../../database';
import { ShipBlock } from '../../../types/ship';
import { EosioActionTrace, EosioTransaction } from '../../../types/eosio';
import AtomicAssetsHandler, { OfferState } from './index';
import logger from '../../../utils/winston';
import { eosioTimestampToDate, serializeEosioName } from '../../../utils/eosio';
import { LogTransferActionData } from './types/actions';

export default class AtomicAssetsActionHandler {
    private readonly contractName: string;

    constructor(readonly core: AtomicAssetsHandler) {
        this.contractName = serializeEosioName(this.core.args.atomicassets_account);
    }

    async handleTrace(db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace, tx: EosioTransaction): Promise<void> {
        if (trace.act.account !== this.core.args.atomicassets_account) {
            logger.warn('[atomicassets] Received action from wrong contract: ' + trace.act.account);
        }

        if (typeof trace.act.data === 'string') {
            throw new Error('Data of atomicassets action could not be deserialized: ' + trace.act.name);
        }

        if (['acceptoffer', 'declineoffer', 'canceloffer'].indexOf(trace.act.name) >= 0) {
            await this.handleOfferTrace(db, block, trace, tx);
        } else if (['logtransfer'].indexOf(trace.act.name) >= 0) {
            await this.handleTransferTrace(db, block, trace, tx);
        } else if (['logmint', 'logburnasset', 'logbackasset', 'logsetdata'].indexOf(trace.act.name) >= 0) {
            await this.handleAssetTrace(db, block, trace, tx);
        } else if (['lognewpreset'].indexOf(trace.act.name) >= 0) {
            await this.handlePresetTrace(db, block, trace, tx);
        } else if ([
            'addcolauth', 'addnotifyacc', 'createcol', 'forbidnotify',
            'remcolauth', 'remnotifyacc', 'setmarketfee', 'setcoldata'
        ].indexOf(trace.act.name) >= 0) {
            await this.handleCollectionTrace(db, block, trace, tx);
        } else if (['createscheme'].indexOf(trace.act.name) >= 0) {
            await this.handleSchemeTrace(db, block, trace, tx);
        }
    }

    async handleOfferTrace(db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace, tx: EosioTransaction): Promise<void> {
        let offerChange = null;

        if (trace.act.name === 'acceptoffer') {
            // @ts-ignore
            offerChange = { offer_id: trace.act.data.offer_id, state: OfferState.ACCEPTED };
        } else if (trace.act.name === 'declineoffer') {
            // @ts-ignore
            offerChange = { offer_id: trace.act.data.offer_id, state: OfferState.DECLINED };
        } else if (trace.act.name === 'canceloffer') {
            // @ts-ignore
            offerChange = { offer_id: trace.act.data.offer_id, state: OfferState.CANCELLED };
        }

        if (offerChange !== null) {
            await db.update('atomicassets_offers', {
                state: offerChange.state,
                updated_at_block: block.block_num,
                updated_at_time: eosioTimestampToDate(block.timestamp).getTime()
            }, {
                str: 'contract = $1 AND offer_id = $2',
                values: [this.contractName, offerChange.offer_id]
            }, ['contract', 'offer_id']);
        }
    }

    async handleTransferTrace(db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace, tx: EosioTransaction): Promise<void> {
        // @ts-ignore
        const data: LogTransferActionData = trace.act.data;

        const query = await db.insert('atomicassets_transfers', {
            contact: this.contractName,
            sender: serializeEosioName(data['from']),
            recipient: serializeEosioName(data.to),
            memo: data.memo,
            txid: Buffer.from(tx.id, 'hex'),
            created_at_block: block.block_num,
            created_at_time: eosioTimestampToDate(block.timestamp).getTime()
        }, ['transfer_id']);

        if (query.rowCount === 0) {
            throw new Error('Could not insert atomicassets transfer');
        }

        await db.insert('atomicassets_transfers_assets', data.asset_ids.map((assetID) => ({
            transfer_id: query.rows[0].transfer_id,
            contact: this.contractName,
            asset_id: assetID
        })), ['transfer_id', 'contract', 'asset_id']);

        // TODO check offers
    }

    async handleAssetTrace(db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace, tx: EosioTransaction): Promise<void> {

    }

    async handleCollectionTrace(db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace, tx: EosioTransaction): Promise<void> {

    }

    async handlePresetTrace(db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace, tx: EosioTransaction): Promise<void> {

    }

    async handleSchemeTrace(db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace, tx: EosioTransaction): Promise<void> {

    }

    private async createLogMessage(
        db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction,
        name: string, relation_name: string, relation_id: string, data: any
    ) {
        await db.insert('atomicassets_logs', {
            contract: this.contractName,
            name: name,
            relation_name: relation_name,
            relation_id: relation_id,
            data: JSON.stringify(data),
            txid: Buffer.from(tx.id, 'hex'),
            created_at_block: block.block_num,
            created_at_time: eosioTimestampToDate(block.timestamp).getTime()
        }, ['log_id']);
    }
}
