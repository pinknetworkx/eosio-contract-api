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

    destructors.push(processor.onActionTrace(
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

            notifier.sendActionTrace('offers', block, tx, trace);
        }, AtomicAssetsUpdatePriority.ACTION_CREATE_OFFER.valueOf()
    ));

    destructors.push(processor.onActionTrace(
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
        }, AtomicAssetsUpdatePriority.ACTION_UPDATE_OFFER.valueOf()
    ));

    destructors.push(processor.onActionTrace(
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
        }, AtomicAssetsUpdatePriority.ACTION_UPDATE_OFFER.valueOf()
    ));

    destructors.push(processor.onActionTrace(
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
        }, AtomicAssetsUpdatePriority.ACTION_UPDATE_OFFER.valueOf()
    ));

    let transferredAssets: string[] = [];
    destructors.push(processor.onActionTrace(
        contract, 'logtransfer',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<LogTransferActionData>): Promise<void> => {
            transferredAssets.push(...trace.act.data.asset_ids);
        }, AtomicAssetsUpdatePriority.INDEPENDENT.valueOf()
    ));

    destructors.push(processor.onActionTrace(
        contract, 'logburnasset',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<LogBurnAssetActionData>): Promise<void> => {
            transferredAssets.push(trace.act.data.asset_id);
        }, AtomicAssetsUpdatePriority.INDEPENDENT.valueOf()
    ));

    destructors.push(processor.onCommit(
        async (db: ContractDBTransaction): Promise<void> => {
            try {
                if (transferredAssets.length === 0) {
                    return;
                }

                const relatedOffersQuery = await db.query(
                    'SELECT DISTINCT ON (offer.offer_id) offer.offer_id, offer.state ' +
                    'FROM atomicassets_offers offer, atomicassets_offers_assets asset ' +
                    'WHERE offer.contract = asset.contract AND offer.offer_id = asset.offer_id AND ' +
                    'offer.state IN (' + [OfferState.PENDING.valueOf(), OfferState.INVALID.valueOf()].join(',') + ') AND ' +
                    'offer.contract = $1 AND asset.asset_id = ANY ($2)',
                    [core.args.atomicassets_account, transferredAssets]
                );

                if (relatedOffersQuery.rowCount === 0) {
                    return;
                }

                const invalidOffersQuery = await db.query(
                    'SELECT DISTINCT ON (offer_asset.offer_id) offer_asset.offer_id ' +
                    'FROM atomicassets_offers_assets offer_asset, atomicassets_assets asset ' +
                    'WHERE offer_asset.contract = asset.contract AND offer_asset.asset_id = asset.asset_id AND ' +
                    'offer_asset.offer_id = ANY ($2) AND ' +
                    '(offer_asset.owner != asset.owner OR asset.owner IS NULL) AND offer_asset.contract = $1',
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
                    .filter(row => invalidOffersQuery.rows.map(row => row.offer_id).indexOf(row) === -1)
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
                        state: OfferState.PENDING.valueOf()
                    }, {
                        str: 'contract = $1 AND offer_id = ANY ($2) AND state = $3',
                        values: [core.args.atomicassets_account, validOffers, OfferState.INVALID.valueOf()]
                    }, ['contract', 'offer_id']);
                }
            } finally {
                transferredAssets = [];
            }
        }
    ));

    return (): any => destructors.map(fn => fn());
}
