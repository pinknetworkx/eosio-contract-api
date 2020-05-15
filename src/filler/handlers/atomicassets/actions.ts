import { ContractDBTransaction } from '../../database';
import { ShipBlock } from '../../../types/ship';
import { EosioActionTrace, EosioTransaction } from '../../../types/eosio';
import AtomicAssetsHandler, { OfferAssetState, OfferState } from './index';
import logger from '../../../utils/winston';
import { deserializeEosioName, eosioTimestampToDate, serializeEosioName } from '../../../utils/eosio';
import {
    AcceptOfferActionData,
    AddColAuthActionData,
    AddNotifyAccActionData, CancelOfferActionData,
    CreateColActionData,
    CreateSchemeActionData, DeclineOfferActionData,
    ExtendSchemeActionData,
    ForbidNotifyActionData,
    LogBackAssetActionData,
    LogBurnAssetActionData,
    LogMintAssetActionData,
    LogNewPresetActionData,
    LogSetActionData,
    LogTransferActionData,
    RemColAuthActionData,
    RemNotifyAccActionData,
    SetColDataActionData,
    SetMarketFeeActionData
} from './types/actions';

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
        } else if (['createscheme', 'extendscheme'].indexOf(trace.act.name) >= 0) {
            await this.handleSchemeTrace(db, block, trace, tx);
        }
    }

    async handleOfferTrace(db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace, tx: EosioTransaction): Promise<void> {
        let offerChange = null;

        if (trace.act.name === 'acceptoffer') {
            // @ts-ignore
            const data: AcceptOfferActionData = trace.act.data;

            offerChange = { offer_id: data.offer_id, state: OfferState.ACCEPTED.valueOf() };

            await this.createLogMessage(db, block, tx, 'accept', 'offer', data.offer_id, null);
        } else if (trace.act.name === 'declineoffer') {
            // @ts-ignore
            const data: DeclineOfferActionData = trace.act.data;

            offerChange = { offer_id: data.offer_id, state: OfferState.DECLINED.valueOf() };

            await this.createLogMessage(db, block, tx, 'decline', 'offer', data.offer_id, null);
        } else if (trace.act.name === 'canceloffer') {
            // @ts-ignore
            const data: CancelOfferActionData = trace.act.data;

            offerChange = { offer_id: data.offer_id, state: OfferState.CANCELLED.valueOf() };

            await this.createLogMessage(db, block, tx, 'cancel', 'offer', data.offer_id, null);
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

        // check offers whether they have become invalid
        const assetQuery = await db.query(
            'SELECT offer_id, owner, asset_id, state ' +
            'FROM atomicassets_offers offers, atomicassets_offers_assets assets ' +
            'WHERE offers.contract = assets.contract AND offers.offer_id = assets.offerID AND ' +
                'offers.state IN (' + [OfferState.PENDING.valueOf(), OfferState.INVALID.valueOf()].join(', ') + ') AND ' +
                'assets.contract = ' + this.contractName + ' AND assets.asset_id IN (' + data.asset_ids.join(', ') + ')'
        );
        const changedOffers = [];

        for (const asset of assetQuery.rows) {
            const owner = deserializeEosioName(asset.owner);

            if (owner === data.to && asset.state === OfferAssetState.MISSING.valueOf()) {
                if (changedOffers.indexOf(asset.offer_id) === -1) {
                    changedOffers.push(asset.offer_id);
                }

                await db.update('atomicassets_offers_assets', {
                    state: OfferAssetState.NORMAL.valueOf()
                }, {
                    str: 'contract = $1 AND offer_id = $2 AND asset_id = $3',
                    values: [this.contractName, asset.offer_id, asset.asset_id]
                }, ['contract', 'offer_id', 'asset_id']);
            } else if (owner !== data.to && asset.state !== OfferAssetState.MISSING.valueOf()) {
                if (changedOffers.indexOf(asset.offer_id) === -1) {
                    changedOffers.push(asset.offer_id);
                }

                await db.update('atomicassets_offers_assets', {
                    state: OfferAssetState.MISSING.valueOf()
                }, {
                    str: 'contract = $1 AND offer_id = $2 AND asset_id = $3',
                    values: [this.contractName, asset.offer_id, asset.asset_id]
                }, ['contract', 'offer_id', 'asset_id']);
            }
        }

        const offerQuery = await db.query(
            'SELECT offers.offer_id, offers.state' +
            'FROM atomicassets_offers offers, atomicassets_offers_assets assets' +
            'WHERE offers.contract = assets.contract AND offers.offer_id = assets.offerID AND ' +
                'offers.offer_id IN (' + changedOffers.join(',') + ') AND contract = ' + this.contractName + ' AND' +
                'offers.state IN (' + [OfferState.PENDING.valueOf(), OfferState.INVALID.valueOf()].join(', ') + ') AND ' +
                'assets.state = ' + OfferAssetState.MISSING.valueOf() + '' +
            'GROUP BY offers.offer_id, offers.state'
        );

        for (const offer of offerQuery.rows) {
            if (offer.state === OfferState.PENDING.valueOf()) {
                await db.update('atomicassets_offers', {
                    state: OfferState.INVALID.valueOf()
                }, {
                    str: 'contract = $1 AND offer_id = $2',
                    values: [this.contractName, offer.offer_id]
                }, ['contract', 'offer_id']);
            }

            const index = changedOffers.indexOf(offer.offer_id);

            if (index >= 0) {
                changedOffers.splice(index, 1);
            }
        }

        for (const offerID of changedOffers) {
            await db.update('atomicassets_offers', {
                state: OfferState.PENDING.valueOf()
            }, {
                str: 'contract = $1 AND offer_id = $2',
                values: [this.contractName, offerID]
            }, ['contract', 'offer_id']);
        }
    }

    async handleAssetTrace(db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace, tx: EosioTransaction): Promise<void> {
        if (trace.act.name === 'logmint') {
            // @ts-ignore
            const data: LogMintAssetActionData = trace.act.data;

            await this.createLogMessage(db, block, tx, 'mint', 'asset', data.asset_id, {
                minter: data.minter,
                new_owner: data.new_owner
            });
        } else if (trace.act.name === 'logburnasset') {
            // @ts-ignore
            const data: LogBurnAssetActionData = trace.act.data;

            await this.createLogMessage(db, block, tx, 'burn', 'asset', data.asset_id, {
                backed_tokens: data.backed_tokens
            });
        } else if (trace.act.name === 'logbackasset') {
            // @ts-ignore
            const data: LogBackAssetActionData = trace.act.data;

            await this.createLogMessage(db, block, tx, 'back', 'asset', data.asset_id, {
                back_quantity: data.back_quantity
            });
        } if (trace.act.name === 'logsetdata') {
            // @ts-ignore
            const data: LogSetActionData = trace.act.data;
            const delta = [];

            // update data
            const localData: {[key: string]: string} = {};
            for (const row of data.new_data) {
                localData[row.key] = JSON.stringify(row.value[1]);
            }

            const dbDataQuery = (await db.query(
                'SELECT "key", "value", mutable FROM atomicassets_assets_data WHERE contract = $1 and asset_id = $2 AND mutable = $3',
                [this.contractName, data.asset_id, true]
            ));

            for (const dbData of dbDataQuery.rows) {
                if (typeof localData[dbData.key] === 'undefined') {
                    delta.push({
                        action: 'remove',
                        key: dbData.key,
                        before: dbData.value,
                        after: null
                    });
                } else {
                    if (JSON.stringify(dbData.value) !== localData[dbData.key]) {
                        delta.push({
                            action: 'update',
                            key: dbData.key,
                            before: dbData.value,
                            after: JSON.parse(localData[dbData.key])
                        });
                    }

                    delete localData[dbData.key];
                }
            }

            for (const key of Object.keys(localData)) {
                delta.push({
                    action: 'create',
                    key: key,
                    before: null,
                    after: localData[key]
                });
            }

            await this.createLogMessage(db, block, tx, 'update', 'asset', data.asset_id, delta);
        }
    }

    async handleCollectionTrace(db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace, tx: EosioTransaction): Promise<void> {
        if (trace.act.name === 'addcolauth') {
            // @ts-ignore
            const data: AddColAuthActionData = trace.act.data;

            await this.createLogMessage(db, block, tx, 'add_authorized_accounts', 'collection', data.collection_name, {
                account: data.account_to_add
            });
        } else if (trace.act.name === 'addnotifyacc') {
            // @ts-ignore
            const data: AddNotifyAccActionData = trace.act.data;

            await this.createLogMessage(db, block, tx, 'add_notify_accounts', 'collection', data.collection_name, {
                account: data.account_to_add
            });
        } else if (trace.act.name === 'createcol') {
            // @ts-ignore
            const data: CreateColActionData = trace.act.data;

            await this.createLogMessage(db, block, tx, 'create', 'collection', data.collection_name, data);
        } else if (trace.act.name === 'forbidnotify') {
            // @ts-ignore
            const data: ForbidNotifyActionData = trace.act.data;

            await this.createLogMessage(db, block, tx, 'forbid_notify', 'collection', data.collection_name, null);
        } else if (trace.act.name === 'remcolauth') {
            // @ts-ignore
            const data: RemColAuthActionData = trace.act.data;

            await this.createLogMessage(db, block, tx, 'remove_authorized_accounts', 'collection', data.collection_name, {
                account: data.account_to_remove
            });
        } else if (trace.act.name === 'remnotifyacc') {
            // @ts-ignore
            const data: RemNotifyAccActionData = trace.act.data;

            await this.createLogMessage(db, block, tx, 'remove_notify_accounts', 'collection', data.collection_name, {
                account: data.account_to_remove
            });
        } else if (trace.act.name === 'setmarketfee') {
            // @ts-ignore
            const data: SetMarketFeeActionData = trace.act.data;

            await this.createLogMessage(db, block, tx, 'update_market_fee', 'collection', data.collection_name, {
                market_fee: data.market_fee
            });
        } else if (trace.act.name === 'setcoldata') {
            // @ts-ignore
            const data: SetColDataActionData = trace.act.data;

            await this.createLogMessage(db, block, tx, 'update_data', 'collection', data.collection_name, {
                data: data.data
            });
        }
    }

    async handlePresetTrace(db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace, tx: EosioTransaction): Promise<void> {
        if (trace.act.name === 'lognewpreset') {
            // @ts-ignore
            const data: LogNewPresetActionData = trace.act.data;

            await this.createLogMessage(db, block, tx, 'create', 'preset', data.collection_name + ':' + data.preset_id, {
                creator: data.authorized_creator
            });
        }
    }

    async handleSchemeTrace(db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace, tx: EosioTransaction): Promise<void> {
        if (trace.act.name === 'createscheme') {
            // @ts-ignore
            const data: CreateSchemeActionData = trace.act.data;

            await this.createLogMessage(db, block, tx, 'create', 'scheme', data.collection_name + ':' + data.scheme_name, {
                authorized_creator: data.authorized_creator,
                scheme_format: data.scheme_format
            });
        } else if (trace.act.name === 'extendscheme') {
            // @ts-ignore
            const data: ExtendSchemeActionData = trace.act.data;

            await this.createLogMessage(db, block, tx, 'extend', 'scheme', data.collection_name + ':' + data.scheme_name, {
                authorized_editor: data.authorized_editor,
                scheme_format_extension: data.scheme_format_extension
            });
        }
    }

    private async createLogMessage(
        db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction,
        name: string, relationName: string, relationId: string | number, data: any
    ): Promise<void> {
        await db.insert('atomicassets_logs', {
            contract: this.contractName,
            name: name,
            relation_name: relationName,
            relation_id: relationId,
            data: JSON.stringify(data),
            txid: Buffer.from(tx.id, 'hex'),
            created_at_block: block.block_num,
            created_at_time: eosioTimestampToDate(block.timestamp).getTime()
        }, ['log_id']);
    }
}
