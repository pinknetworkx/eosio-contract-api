import { ContractDBTransaction } from '../../database';
import { ShipBlock } from '../../../types/ship';
import { EosioActionTrace, EosioTransaction } from '../../../types/eosio';
import AtomicAssetsHandler, { JobPriority, OfferAssetState, OfferState } from './index';
import logger from '../../../utils/winston';
import { deserializeEosioName, eosioTimestampToDate, serializeEosioName } from '../../../utils/eosio';
import {
    AcceptOfferActionData,
    AddColAuthActionData,
    AddNotifyAccActionData, CancelOfferActionData,
    CreateColActionData,
    CreateSchemaActionData, DeclineOfferActionData,
    ExtendSchemaActionData,
    ForbidNotifyActionData,
    LogBackAssetActionData,
    LogBurnAssetActionData,
    LogMintAssetActionData, LogNewOfferActionData,
    LogNewTemplateActionData,
    LogSetDataActionData,
    LogTransferActionData,
    RemColAuthActionData,
    RemNotifyAccActionData,
    SetColDataActionData,
    SetMarketFeeActionData
} from './types/actions';
import { convertAttributeMapToObject, saveAssetTableRow, saveOfferTableRow } from './helper';

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

        if (['lognewoffer'].indexOf(trace.act.name) >= 0) {
            this.core.addJob(async () => {
                logger.debug('AtomicAssets Action', trace.act);

                await this.handleOfferCreateTrace(db, block, trace, tx);
            }, JobPriority.ACTION_CREATE_OFFER);
        } else if (['acceptoffer', 'declineoffer', 'canceloffer'].indexOf(trace.act.name) >= 0) {
            this.core.addJob(async () => {
                logger.debug('AtomicAssets Action', trace.act);

                await this.handleOfferUpdateTrace(db, block, trace, tx);
            }, JobPriority.ACTION_UPDATE_OFFER);
        } else if (['logtransfer'].indexOf(trace.act.name) >= 0) {
            this.core.addJob(async () => {
                logger.debug('AtomicAssets Action', trace.act);

                await this.handleTransferTrace(db, block, trace, tx);
            }, JobPriority.ACTION_TRANSFER_ASSET);
        } else if (['logburnasset'].indexOf(trace.act.name) >= 0) {
            this.core.addJob(async () => {
                logger.debug('AtomicAssets Action', trace.act);

                await this.handleAssetBurnTrace(db, block, trace, tx);
            }, JobPriority.ACTION_BURN_ASSET);
        } else if (['logmint', 'logburnasset', 'logbackasset', 'logsetdata'].indexOf(trace.act.name) >= 0) {
            this.core.addJob(async () => {
                logger.debug('AtomicAssets Action', trace.act);

                await this.handleAssetUpdateTrace(db, block, trace, tx);
            }, JobPriority.INDEPENDENT);
        } else if (['lognewtempl'].indexOf(trace.act.name) >= 0) {
            this.core.addJob(async () => {
                logger.debug('AtomicAssets Action', trace.act);

                await this.handleTemplateTrace(db, block, trace, tx);
            }, JobPriority.INDEPENDENT);
        } else if ([
            'addcolauth', 'addnotifyacc', 'createcol', 'forbidnotify',
            'remcolauth', 'remnotifyacc', 'setmarketfee', 'setcoldata'
        ].indexOf(trace.act.name) >= 0) {
            this.core.addJob(async () => {
                logger.debug('AtomicAssets Action', trace.act);

                await this.handleCollectionTrace(db, block, trace, tx);
            }, JobPriority.INDEPENDENT);
        } else if (['createschema', 'extendschema'].indexOf(trace.act.name) >= 0) {
            this.core.addJob(async () => {
                logger.debug('AtomicAssets Action', trace.act);

                await this.handleSchemaTrace(db, block, trace, tx);
            }, JobPriority.INDEPENDENT);
        }
    }

    async handleOfferCreateTrace(
        db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace, _: EosioTransaction
    ): Promise<void> {
        // @ts-ignore
        const data: LogNewOfferActionData = trace.act.data;

        const query = await db.query(
            'SELECT offer_id FROM atomicassets_offers WHERE contract = $1 AND offer_id = $2',
            [this.contractName, data.offer_id]
        );

        if (query.rowCount === 0) {
            await saveOfferTableRow(db, block, this.contractName, {
                offer_id: data.offer_id,
                sender: data.sender,
                recipient: data.recipient,
                sender_asset_ids: data.sender_asset_ids,
                recipient_asset_ids: data.recipient_asset_ids,
                memo: data.memo
            }, false);
        }
    }

    async handleOfferUpdateTrace(
        db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace, tx: EosioTransaction
    ): Promise<void> {
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
            contract: this.contractName,
            sender: serializeEosioName(data['from']),
            recipient: serializeEosioName(data.to),
            memo: String(data.memo).substr(0, 256),
            txid: Buffer.from(tx.id, 'hex'),
            created_at_block: block.block_num,
            created_at_time: eosioTimestampToDate(block.timestamp).getTime()
        }, ['transfer_id']);

        if (query.rowCount === 0) {
            throw new Error('Could not insert atomicassets transfer');
        }

        await db.insert('atomicassets_transfers_assets', data.asset_ids.map((assetID) => ({
            transfer_id: query.rows[0].transfer_id,
            contract: this.contractName,
            asset_id: assetID
        })), ['transfer_id', 'contract', 'asset_id']);

        // check offers whether they have become invalid
        const assetQuery = await db.query(
            'SELECT assets.offer_id, assets.owner, assets.asset_id, assets.state ' +
            'FROM atomicassets_offers offers, atomicassets_offers_assets assets ' +
            'WHERE offers.contract = assets.contract AND offers.offer_id = assets.offer_id AND ' +
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

        if (changedOffers.length > 0) {
            const offerQuery = await db.query(
                'SELECT offers.offer_id, offers.state ' +
                'FROM atomicassets_offers offers, atomicassets_offers_assets assets ' +
                'WHERE offers.contract = assets.contract AND offers.offer_id = assets.offer_id AND ' +
                    'offers.offer_id IN (' + changedOffers.join(',') + ') AND offers.contract = ' + this.contractName + ' AND ' +
                    'offers.state IN (' + [OfferState.PENDING.valueOf(), OfferState.INVALID.valueOf()].join(', ') + ') AND ' +
                    'assets.state = ' + OfferAssetState.MISSING.valueOf() + ' ' +
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
    }

    async handleAssetBurnTrace(db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace, tx: EosioTransaction): Promise<void> {
        if (trace.act.name === 'logburnasset') {
            // @ts-ignore
            const data: LogBurnAssetActionData = trace.act.data;

            await saveAssetTableRow(db, block, this.contractName, data.asset_owner, {
                asset_id: data.asset_id,
                collection_name: data.collection_name,
                schema_name: data.schema_name,
                template_id: data.template_id,
                ram_payer: '.',
                backed_tokens: data.backed_tokens,
                immutable_serialized_data: null,
                mutable_serialized_data: null
            }, true, data.old_immutable_data, data.old_mutable_data);

            await this.createLogMessage(db, block, tx, 'burn', 'asset', data.asset_id, {
                backed_tokens: data.backed_tokens
            });
        }
    }

    async handleAssetUpdateTrace(
        db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace, tx: EosioTransaction
    ): Promise<void> {
        if (trace.act.name === 'logmint') {
            // @ts-ignore
            const data: LogMintAssetActionData = trace.act.data;

            await this.createLogMessage(db, block, tx, 'mint', 'asset', data.asset_id, {
                minter: data.minter,
                new_owner: data.new_owner
            });
        } else if (trace.act.name === 'logbackasset') {
            // @ts-ignore
            const data: LogBackAssetActionData = trace.act.data;

            await this.createLogMessage(db, block, tx, 'back', 'asset', data.asset_id, {
                back_quantity: data.backed_token
            });
        } if (trace.act.name === 'logsetdata') {
            // @ts-ignore
            const data: LogSetDataActionData = trace.act.data;
            const delta = [];

            // update data
            const newData: {[key: string]: string} = convertAttributeMapToObject(data.new_data);
            const oldData: {[key: string]: string} = convertAttributeMapToObject(data.old_data);

            for (const key of Object.keys(oldData)) {
                if (typeof newData[key] === 'undefined') {
                    delta.push({
                        action: 'remove',
                        key: key,
                        before: oldData[key],
                        after: null
                    });
                } else {
                    if (JSON.stringify(oldData[key]) !== JSON.stringify(newData[key])) {
                        delta.push({
                            action: 'update',
                            key: key,
                            before: oldData[key],
                            after: newData[key]
                        });
                    }

                    delete newData[key];
                }
            }

            for (const key of Object.keys(newData)) {
                delta.push({
                    action: 'create',
                    key: key,
                    before: null,
                    after: newData[key]
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

    async handleTemplateTrace(db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace, tx: EosioTransaction): Promise<void> {
        if (trace.act.name === 'lognewtempl') {
            // @ts-ignore
            const data: LogNewTemplateActionData = trace.act.data;

            await this.createLogMessage(db, block, tx, 'create', 'template', data.collection_name + ':' + data.template_id, {
                creator: data.authorized_creator
            });
        }
    }

    async handleSchemaTrace(db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace, tx: EosioTransaction): Promise<void> {
        if (trace.act.name === 'createschema') {
            // @ts-ignore
            const data: CreateSchemaActionData = trace.act.data;

            await this.createLogMessage(db, block, tx, 'create', 'schema', data.collection_name + ':' + data.schema_name, {
                authorized_creator: data.authorized_creator,
                schema_format: data.schema_format
            });
        } else if (trace.act.name === 'extendschema') {
            // @ts-ignore
            const data: ExtendSchemaActionData = trace.act.data;

            await this.createLogMessage(db, block, tx, 'extend', 'schema', data.collection_name + ':' + data.schema_name, {
                authorized_editor: data.authorized_editor,
                schema_format_extension: data.schema_format_extension
            });
        }
    }

    private async createLogMessage(
        db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction,
        name: string, relationName: string, relationId: string | number, data: any
    ): Promise<void> {
        await db.insert('atomicassets_logs', {
            contract: this.contractName,
            name: String(name).substr(0, 64),
            relation_name: String(relationName).substr(0, 64),
            relation_id: String(relationId).substr(0, 256),
            data: JSON.stringify(data),
            txid: Buffer.from(tx.id, 'hex'),
            created_at_block: block.block_num,
            created_at_time: eosioTimestampToDate(block.timestamp).getTime()
        }, ['log_id']);
    }
}
