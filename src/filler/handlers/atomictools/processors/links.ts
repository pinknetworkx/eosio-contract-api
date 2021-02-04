import AtomicToolsHandler, { AtomicToolsUpdatePriority, LinkState } from '../index';
import DataProcessor from '../../../processor';
import { ContractDBTransaction } from '../../../database';
import { ShipBlock } from '../../../../types/ship';
import { EosioActionTrace, EosioTransaction } from '../../../../types/eosio';
import { Numeric } from 'eosjs';
import { eosioTimestampToDate } from '../../../../utils/eosio';
import { CancelLinkActionData, ClaimLinkActionData, LogLinkStartActionData, LogNewLinkActionData } from '../types/actions';

export function linkProcessor(core: AtomicToolsHandler, processor: DataProcessor): () => any {
    const destructors: Array<() => any> = [];

    destructors.push(processor.onActionTrace(
        core.args.atomictools_account, 'lognewlink',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<LogNewLinkActionData>): Promise<void> => {
            const key = Numeric.stringToPublicKey(trace.act.data.key);

            await db.insert('atomictools_links', {
                tools_contract: core.args.atomictools_account,
                link_id: trace.act.data.link_id,
                assets_contract: core.args.atomicassets_account,
                creator: trace.act.data.creator,
                claimer: null,
                state: LinkState.WAITING.valueOf(),
                key_type: key.type.valueOf(),
                key_data: key.data,
                memo: trace.act.data.memo.substr(0, 256),
                created_at_block: block.block_num,
                created_at_time: eosioTimestampToDate(block.timestamp).getTime(),
                updated_at_block: block.block_num,
                updated_at_time: eosioTimestampToDate(block.timestamp).getTime()
            }, ['tools_contract', 'link_id']);

            const rows = trace.act.data.asset_ids.map((assetID, index) => ({
                tools_contract: core.args.atomictools_account,
                link_id: trace.act.data.link_id,
                assets_contract: core.args.atomicassets_account,
                index: index + 1,
                asset_id: assetID
            }));

            await db.insert('atomictools_links_assets', rows, ['tools_contract', 'link_id', 'assets_contract', 'asset_id']);
        }, AtomicToolsUpdatePriority.ACTION_CREATE_LINK.valueOf()
    ));

    destructors.push(processor.onActionTrace(
        core.args.atomictools_account, 'loglinkstart',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<LogLinkStartActionData>): Promise<void> => {
            await db.update('atomictools_links', {
                state: LinkState.CREATED.valueOf(),
                updated_at_block: block.block_num,
                updated_at_time: eosioTimestampToDate(block.timestamp).getTime()
            }, {
                str: 'tools_contract = $1 AND link_id = $2',
                values: [core.args.atomictools_account, trace.act.data.link_id]
            }, ['tools_contract', 'link_id']);
        }, AtomicToolsUpdatePriority.ACTION_UPDATE_LINK.valueOf()
    ));

    destructors.push(processor.onActionTrace(
        core.args.atomictools_account, 'cancellink',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<CancelLinkActionData>): Promise<void> => {
            await db.update('atomictools_links', {
                state: LinkState.CANCELED.valueOf(),
                updated_at_block: block.block_num,
                updated_at_time: eosioTimestampToDate(block.timestamp).getTime()
            }, {
                str: 'tools_contract = $1 AND link_id = $2',
                values: [core.args.atomictools_account, trace.act.data.link_id]
            }, ['tools_contract', 'link_id']);
        }, AtomicToolsUpdatePriority.ACTION_UPDATE_LINK.valueOf()
    ));

    destructors.push(processor.onActionTrace(
        core.args.atomictools_account, 'claimlink',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<ClaimLinkActionData>): Promise<void> => {
            await db.update('atomictools_links', {
                state: LinkState.CLAIMED.valueOf(),
                claimer: trace.act.data.claimer,
                updated_at_block: block.block_num,
                updated_at_time: eosioTimestampToDate(block.timestamp).getTime()
            }, {
                str: 'tools_contract = $1 AND link_id = $2',
                values: [core.args.atomictools_account, trace.act.data.link_id]
            }, ['tools_contract', 'link_id']);
        }, AtomicToolsUpdatePriority.ACTION_UPDATE_LINK.valueOf()
    ));

    return (): any => destructors.map(fn => fn());
}
