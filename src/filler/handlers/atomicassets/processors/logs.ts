import AtomicAssetsHandler, { AtomicAssetsUpdatePriority } from '../index';
import DataProcessor from '../../../processor';
import { ContractDBTransaction } from '../../../database';
import { EosioActionTrace, EosioTransaction } from '../../../../types/eosio';
import { ShipBlock } from '../../../../types/ship';
import {
    AcceptOfferActionData,
    AddColAuthActionData,
    CancelOfferActionData,
    CreateColActionData, CreateSchemaActionData,
    DeclineOfferActionData, ExtendSchemaActionData,
    ForbidNotifyActionData, LockTemplateActionData,
    LogBackAssetActionData,
    LogBurnAssetActionData,
    LogMintAssetActionData,
    LogNewOfferActionData,
    LogNewTemplateActionData,
    LogSetDataActionData,
    RemColAuthActionData,
    RemNotifyAccActionData,
    SetColDataActionData,
    SetMarketFeeActionData
} from '../types/actions';

export function logProcessor(core: AtomicAssetsHandler, processor: DataProcessor): () => any {
    const destructors: Array<() => any> = [];
    const contract = core.args.atomicassets_account;

    /* OFFERS */
    destructors.push(processor.onActionTrace(
        contract, 'lognewoffer',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<LogNewOfferActionData>): Promise<void> => {
            await db.logTrace(block, tx, trace, {
                offer_id: trace.act.data.offer_id
            });
        }, AtomicAssetsUpdatePriority.LOGS.valueOf()
    ));

    destructors.push(processor.onActionTrace(
        contract, 'acceptoffer',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<AcceptOfferActionData>): Promise<void> => {
            await db.logTrace(block, tx, trace, trace.act.data);
        }, AtomicAssetsUpdatePriority.LOGS.valueOf()
    ));

    destructors.push(processor.onActionTrace(
        contract, 'declineoffer',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<DeclineOfferActionData>): Promise<void> => {
            await db.logTrace(block, tx, trace, trace.act.data);
        }, AtomicAssetsUpdatePriority.LOGS.valueOf()
    ));

    destructors.push(processor.onActionTrace(
        contract, 'canceloffer',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<CancelOfferActionData>): Promise<void> => {
            await db.logTrace(block, tx, trace, trace.act.data);
        }, AtomicAssetsUpdatePriority.LOGS.valueOf()
    ));

    /* ASSETS */
    destructors.push(processor.onActionTrace(
        contract, 'logmint',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<LogMintAssetActionData>): Promise<void> => {
            await db.logTrace(block, tx, trace, {
                asset_id: trace.act.data.asset_id,
                new_asset_owner: trace.act.data.new_asset_owner,
                authorized_minter: trace.act.data.authorized_minter
            });
        }, AtomicAssetsUpdatePriority.LOGS.valueOf()
    ));

    destructors.push(processor.onActionTrace(
        contract, 'logburnasset',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<LogBurnAssetActionData>): Promise<void> => {
            await db.logTrace(block, tx, trace, {
                asset_id: trace.act.data.asset_id,
                asset_owner: trace.act.data.asset_owner,
                backed_tokens: trace.act.data.backed_tokens
            });
        }, AtomicAssetsUpdatePriority.LOGS.valueOf()
    ));

    destructors.push(processor.onActionTrace(
        contract, 'logbackasset',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<LogBackAssetActionData>): Promise<void> => {
            await db.logTrace(block, tx, trace, {
                asset_id: trace.act.data.asset_id,
                backed_token: trace.act.data.backed_token
            });
        }, AtomicAssetsUpdatePriority.LOGS.valueOf()
    ));

    destructors.push(processor.onActionTrace(
        contract, 'logsetdata',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<LogSetDataActionData>): Promise<void> => {
            await db.logTrace(block, tx, trace, {
                asset_id: trace.act.data.asset_id,
                old_data: trace.act.data.old_data,
                new_data: trace.act.data.new_data
            });
        }, AtomicAssetsUpdatePriority.LOGS.valueOf()
    ));

    /* COLLECTIONS */
    destructors.push(processor.onActionTrace(
        contract, 'createcol',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<CreateColActionData>): Promise<void> => {
            await db.logTrace(block, tx, trace, trace.act.data);
        }, AtomicAssetsUpdatePriority.LOGS.valueOf()
    ));

    destructors.push(processor.onActionTrace(
        contract, 'addcolauth',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<AddColAuthActionData>): Promise<void> => {
            await db.logTrace(block, tx, trace, trace.act.data);
        }, AtomicAssetsUpdatePriority.LOGS.valueOf()
    ));

    destructors.push(processor.onActionTrace(
        contract, 'forbidnotify',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<ForbidNotifyActionData>): Promise<void> => {
            await db.logTrace(block, tx, trace, trace.act.data);
        }, AtomicAssetsUpdatePriority.LOGS.valueOf()
    ));

    destructors.push(processor.onActionTrace(
        contract, 'remcolauth',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<RemColAuthActionData>): Promise<void> => {
            await db.logTrace(block, tx, trace, trace.act.data);
        }, AtomicAssetsUpdatePriority.LOGS.valueOf()
    ));

    destructors.push(processor.onActionTrace(
        contract, 'remnotifyacc',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<RemNotifyAccActionData>): Promise<void> => {
            await db.logTrace(block, tx, trace, trace.act.data);
        }, AtomicAssetsUpdatePriority.LOGS.valueOf()
    ));

    destructors.push(processor.onActionTrace(
        contract, 'setmarketfee',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<SetMarketFeeActionData>): Promise<void> => {
            await db.logTrace(block, tx, trace, trace.act.data);
        }, AtomicAssetsUpdatePriority.LOGS.valueOf()
    ));

    destructors.push(processor.onActionTrace(
        contract, 'setcoldata',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<SetColDataActionData>): Promise<void> => {
            await db.logTrace(block, tx, trace, trace.act.data);
        }, AtomicAssetsUpdatePriority.LOGS.valueOf()
    ));

    /* TEMPLATES */
    destructors.push(processor.onActionTrace(
        contract, 'lognewtempl',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<LogNewTemplateActionData>): Promise<void> => {
            await db.logTrace(block, tx, trace, {
                collection_name: trace.act.data.collection_name,
                template_id: trace.act.data.template_id,
                authorized_creator: trace.act.data.authorized_creator,
                max_supply: trace.act.data.max_supply
            });
        }, AtomicAssetsUpdatePriority.LOGS.valueOf()
    ));

    destructors.push(processor.onActionTrace(
        contract, 'locktemplate',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<LockTemplateActionData>): Promise<void> => {
            await db.logTrace(block, tx, trace, trace.act.data);
        }, AtomicAssetsUpdatePriority.LOGS.valueOf()
    ));

    /* SCHEMAS */
    destructors.push(processor.onActionTrace(
        contract, 'createschema',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<CreateSchemaActionData>): Promise<void> => {
            await db.logTrace(block, tx, trace, trace.act.data);
        }, AtomicAssetsUpdatePriority.LOGS.valueOf()
    ));

    destructors.push(processor.onActionTrace(
        contract, 'extendschema',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<ExtendSchemaActionData>): Promise<void> => {
            await db.logTrace(block, tx, trace, trace.act.data);
        }, AtomicAssetsUpdatePriority.LOGS.valueOf()
    ));

    return (): any => destructors.map(fn => fn());
}
