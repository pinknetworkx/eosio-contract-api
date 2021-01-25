import AtomicAssetsHandler, { AtomicAssetsUpdatePriority, OfferState } from '../index';
import DataProcessor from '../../../processor';
import { ContractDBTransaction } from '../../../database';
import { EosioActionTrace, EosioTransaction } from '../../../../types/eosio';
import { ShipBlock } from '../../../../types/ship';
import {
    AcceptOfferActionData,
    CancelOfferActionData,
    DeclineOfferActionData, LogBurnAssetActionData,
    LogNewOfferActionData,
    LogTransferActionData
} from '../types/actions';
import { eosioTimestampToDate } from '../../../../utils/eosio';
import ApiNotificationSender from '../../../notifier';

export function offerProcessor(core: AtomicAssetsHandler, processor: DataProcessor, notifier: ApiNotificationSender): () => any {
    const destructors: Array<() => any> = [];
    const contract = core.args.atomicassets_account;

    destructors.push(processor.onTrace(
        contract, 'lognewoffer',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<LogNewOfferActionData>): Promise<void> => {
            await db.insert('atomicassets_offers', {
                contract: contract,
                offer_id: trace.act.data.offer_id,
                sender: trace.act.data.sender,
                recipient: trace.act.data.recipient,
                memo: trace.act.data.memo.substr(0, 256),
                state: OfferState.PENDING.valueOf(),
                updated_at_block: block.block_num,
                updated_at_time: eosioTimestampToDate(block.timestamp).getTime(),
                created_at_block: block.block_num,
                created_at_time: eosioTimestampToDate(block.timestamp).getTime()
            }, ['contract', 'offer_id']);

            await db.insert('atomicassets_offers_assets', [
                ...trace.act.data.sender_asset_ids.map((assetID, index) => ({
                    contract: contract,
                    offer_id: trace.act.data.offer_id,
                    owner: trace.act.data.sender,
                    index: index + 1,
                    asset_id: assetID
                })),
                ...trace.act.data.recipient_asset_ids.map((assetID, index) => ({
                    contract: contract,
                    offer_id: trace.act.data.offer_id,
                    owner: trace.act.data.recipient,
                    index: index + 1,
                    asset_id: assetID
                }))
            ], ['contract', 'offer_id', 'asset_id']);

            notifier.sendTrace('offer', block, tx, trace);
        }, AtomicAssetsUpdatePriority.ACTION_CREATE_OFFER
    ));

    destructors.push(processor.onTrace(
        contract, 'acceptoffer',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<AcceptOfferActionData>): Promise<void> => {
            await db.update('atomicassets_offers', {
                state: OfferState.ACCEPTED.valueOf(),
                updated_at_block: block.block_num,
                updated_at_time: eosioTimestampToDate(block.timestamp).getTime(),
            }, {
                str: 'contract = $1 AND offer_id = $2',
                values: [contract, trace.act.data.offer_id]
            }, ['contract', 'offer_id']);
        }, AtomicAssetsUpdatePriority.ACTION_UPDATE_OFFER
    ));

    destructors.push(processor.onTrace(
        contract, 'declineoffer',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<DeclineOfferActionData>): Promise<void> => {
            await db.update('atomicassets_offers', {
                state: OfferState.DECLINED.valueOf(),
                updated_at_block: block.block_num,
                updated_at_time: eosioTimestampToDate(block.timestamp).getTime(),
            }, {
                str: 'contract = $1 AND offer_id = $2',
                values: [contract, trace.act.data.offer_id]
            }, ['contract', 'offer_id']);
        }, AtomicAssetsUpdatePriority.ACTION_UPDATE_OFFER
    ));

    destructors.push(processor.onTrace(
        contract, 'canceloffer',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<CancelOfferActionData>): Promise<void> => {
            await db.update('atomicassets_offers', {
                state: OfferState.CANCELLED.valueOf(),
                updated_at_block: block.block_num,
                updated_at_time: eosioTimestampToDate(block.timestamp).getTime(),
            }, {
                str: 'contract = $1 AND offer_id = $2',
                values: [contract, trace.act.data.offer_id]
            }, ['contract', 'offer_id']);
        }, AtomicAssetsUpdatePriority.ACTION_UPDATE_OFFER
    ));

    let transferredAssets: string[] = [];
    destructors.push(processor.onTrace(
        contract, 'logtransfer',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<LogTransferActionData>): Promise<void> => {
            transferredAssets.push(...trace.act.data.asset_ids);
        }, AtomicAssetsUpdatePriority.INDEPENDENT
    ));

    destructors.push(processor.onTrace(
        contract, 'logburnasset',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<LogBurnAssetActionData>): Promise<void> => {
            transferredAssets.push(trace.act.data.asset_id);
        }, AtomicAssetsUpdatePriority.INDEPENDENT
    ));

    destructors.push(processor.onCommit(
        async (db: ContractDBTransaction): Promise<void> => {
            if (transferredAssets.length === 0) {
                return;
            }

            const relatedOffersQuery = await db.query(
                'SELECT DISTINCT ON (offer.offer_id) offer.offer_id, offer.state ' +
                'FROM atomicassets_offers offer, atomicassets_offers_assets asset ' +
                'WHERE offer.contract = asset.contract AND offer.offer_id = asset.offer_id AND ' +
                'offer.state IN (' + [OfferState.PENDING.valueOf(), OfferState.INVALID.valueOf()].join(',') + ') AND ' +
                'asset.asset_id = ANY ($2) AND offer.contract = $1',
                [core.args.atomicassets_account, transferredAssets]
            );

            if (relatedOffersQuery.rowCount === 0) {
                return;
            }

            const invalidOffersQuery = await db.query(
                'SELECT DISTINCT ON (o_asset.offer_id) o_asset.offer_id ' +
                'FROM atomicassets_offers_assets o_asset, atomicassets_assets a_asset ' +
                'WHERE o_asset.contract = a_asset.contract AND o_asset.asset_id = a_asset.asset_id AND ' +
                'o_asset.offer_id = ANY ($2) AND ' +
                '(o_asset.owner != a_asset.owner OR a_asset.owner IS NULL) AND o_asset.contract = $1',
                [core.args.atomicassets_account, relatedOffersQuery.rows.map(row => row.offer_id)]
            );

            const currentInvalidOffers = relatedOffersQuery.rows
                .filter(row => row.state === OfferState.INVALID.valueOf())
                .map(row => row.offer_id);
            const currentValidOffers = relatedOffersQuery.rows
                .filter(row => row.state === OfferState.PENDING.valueOf())
                .map(row => row.offer_id);

            const invalidOffers = invalidOffersQuery.rows
                .map((row) => row.offer_id)
                .filter(row => currentInvalidOffers.indexOf(row) === -1);
            const validOffers = relatedOffersQuery.rows
                .map(row => row.offer_id)
                .filter(row => invalidOffers.indexOf(row) === -1)
                .filter(row => currentValidOffers.indexOf(row) === -1);

            if (invalidOffers.length > 0) {
                await db.update('atomicassets_offers', {
                    state: OfferState.INVALID.valueOf()
                }, {
                    str: 'contract = $1 AND offer_id = ANY ($2) AND state = $3',
                    values: [core.args.atomicassets_account, invalidOffers, OfferState.PENDING.valueOf()]
                }, ['contract', 'offer_id']);
            }

            if (validOffers.length > 0) {
                await db.update('atomicassets_offers', {
                    state: OfferState.INVALID.valueOf()
                }, {
                    str: 'contract = $1 AND offer_id = ANY ($2) AND state = $3',
                    values: [core.args.atomicassets_account, validOffers, OfferState.INVALID.valueOf()]
                }, ['contract', 'offer_id']);
            }

            transferredAssets = [];
        }
    ));

    return (): any => destructors.map(fn => fn());
}
