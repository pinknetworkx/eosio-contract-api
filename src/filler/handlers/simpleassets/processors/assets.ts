import SimpleAssetsHandler, { SimpleAssetsUpdatePriority } from '../index';
import DataProcessor from '../../../processor';
import { ContractDBTransaction } from '../../../database';
import { EosioActionTrace, EosioTransaction } from '../../../../types/eosio';
import { ShipBlock } from '../../../../types/ship';
import { eosioTimestampToDate } from '../../../../utils/eosio';
import { arrayChunk } from '../../../../utils';
import {
    BurnLogActionData,
    ChangeAuthorActionData,
    ClaimActionData,
    CreateLogActionData,
    TransferActionData,
    UpdateActionData
} from '../types/actions';
import { parseJsonObject } from '../../../../utils/binary';

export function assetProcessor(core: SimpleAssetsHandler, processor: DataProcessor): () => any {
    const destructors: Array<() => any> = [];
    const contract = core.args.simpleassets_account;

    let tableInserts = {
        'assets': <any[]>[]
    };

    destructors.push(processor.onActionTrace(
        contract, 'createlog',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<CreateLogActionData>): Promise<void> => {
            tableInserts.assets.push({
                contract: contract,
                asset_id: trace.act.data.assetid,
                author: trace.act.data.author,
                category: trace.act.data.category,
                owner: trace.act.data.owner,
                mutable_data: JSON.stringify(parseJsonObject(trace.act.data.mdata)),
                immutable_data: JSON.stringify(parseJsonObject(trace.act.data.idata)),
                burned_by_account: null,
                burned_at_block: null,
                burned_at_time: null,
                transferred_at_block: block.block_num,
                transferred_at_time: eosioTimestampToDate(block.timestamp).getTime(),
                updated_at_block: block.block_num,
                updated_at_time: eosioTimestampToDate(block.timestamp).getTime(),
                minted_at_block: block.block_num,
                minted_at_time: eosioTimestampToDate(block.timestamp).getTime()
            });
        }, SimpleAssetsUpdatePriority.ACTION_MINT_ASSET.valueOf()
    ));

    destructors.push(processor.onPriorityComplete(SimpleAssetsUpdatePriority.ACTION_MINT_ASSET.valueOf(),
        async (db: ContractDBTransaction) => {
            if (tableInserts.assets.length > 0) {
                const chunks = arrayChunk(tableInserts.assets, 50);

                for (const chunk of chunks) {
                    await db.insert('simpleassets_assets', chunk, ['contract', 'asset_id']);
                }
            }

            tableInserts = {
                'assets': []
            };
        }, SimpleAssetsUpdatePriority.ACTION_MINT_ASSET.valueOf()
    ));

    destructors.push(processor.onActionTrace(
        contract, 'burnlog',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<BurnLogActionData>): Promise<void> => {
            await db.update('simpleassets_assets', {
                owner: null,
                burned_by_account: trace.act.data.owner,
                burned_at_block: block.block_num,
                burned_at_time: eosioTimestampToDate(block.timestamp).getTime(),
                updated_at_block: block.block_num,
                updated_at_time: eosioTimestampToDate(block.timestamp).getTime(),
            }, {
                str: 'contract = $1 AND asset_id = ANY($2)',
                values: [contract, trace.act.data.assetids]
            }, ['contract', 'asset_id']);
        }, SimpleAssetsUpdatePriority.ACTION_UPDATE_ASSET.valueOf()
    ));

    destructors.push(processor.onActionTrace(
        contract, 'update',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<UpdateActionData>): Promise<void> => {
            await db.update('simpleassets_assets', {
                mutable_data: JSON.stringify(parseJsonObject(trace.act.data.mdata)),
                updated_at_block: block.block_num,
                updated_at_time: eosioTimestampToDate(block.timestamp).getTime(),
            }, {
                str: 'contract = $1 AND asset_id = $2',
                values: [contract, trace.act.data.assetid]
            }, ['contract', 'asset_id']);
        }, SimpleAssetsUpdatePriority.ACTION_UPDATE_ASSET.valueOf()
    ));

    destructors.push(processor.onActionTrace(
        contract, 'changeauthor',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<ChangeAuthorActionData>): Promise<void> => {
            await db.update('simpleassets_assets', {
                author: trace.act.data.newauthor,
                updated_at_block: block.block_num,
                updated_at_time: eosioTimestampToDate(block.timestamp).getTime(),
            }, {
                str: 'contract = $1 AND asset_id = ANY($2)',
                values: [contract, trace.act.data.assetids]
            }, ['contract', 'asset_id']);
        }, SimpleAssetsUpdatePriority.ACTION_UPDATE_ASSET.valueOf()
    ));

    destructors.push(processor.onActionTrace(
        contract, 'transfer',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<TransferActionData>): Promise<void> => {
            await db.update('simpleassets_assets', {
                owner: trace.act.data.to,
                transferred_at_block: block.block_num,
                transferred_at_time: eosioTimestampToDate(block.timestamp).getTime(),
                updated_at_block: block.block_num,
                updated_at_time: eosioTimestampToDate(block.timestamp).getTime(),
            }, {
                str: 'contract = $1 AND asset_id = ANY ($2) AND owner = $3',
                values: [contract, trace.act.data.assetids, trace.act.data.from]
            }, ['contract', 'asset_id']);

            if (core.args.store_transfers) {
                await db.insert('simpleassets_transfers', {
                    contract: contract,
                    transfer_id: trace.global_sequence,
                    sender: trace.act.data.from,
                    recipient: trace.act.data.to,
                    memo: String(trace.act.data.memo).substr(0, 256),
                    txid: Buffer.from(tx.id, 'hex'),
                    created_at_block: block.block_num,
                    created_at_time: eosioTimestampToDate(block.timestamp).getTime()
                }, ['contract', 'transfer_id']);

                await db.insert('simpleassets_transfers_assets', trace.act.data.assetids.map((assetID, index) => ({
                    transfer_id: trace.global_sequence,
                    contract: contract,
                    index: index + 1,
                    asset_id: assetID
                })), ['contract', 'transfer_id', 'asset_id']);
            }
        }, SimpleAssetsUpdatePriority.ACTION_UPDATE_ASSET.valueOf()
    ));

    destructors.push(processor.onActionTrace(
        contract, 'claim',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<ClaimActionData>): Promise<void> => {
            await db.update('simpleassets_assets', {
                owner: trace.act.data.claimer,
                transferred_at_block: block.block_num,
                transferred_at_time: eosioTimestampToDate(block.timestamp).getTime(),
                updated_at_block: block.block_num,
                updated_at_time: eosioTimestampToDate(block.timestamp).getTime(),
            }, {
                str: 'contract = $1 AND asset_id = ANY ($2)',
                values: [contract, trace.act.data.assetids]
            }, ['contract', 'asset_id']);

            if (core.args.store_transfers) {
                const fromQuery = await db.query(
                    'SELECT owner FROM simpleassets_assets WHERE contract = $1 AND asset_id = ANY($2)',
                    [contract, trace.act.data.assetids]
                );

                await db.insert('simpleassets_transfers', {
                    contract: contract,
                    transfer_id: trace.global_sequence,
                    sender: fromQuery.rowCount > 0 ? fromQuery.rows[0].owner : '.',
                    recipient: trace.act.data.claimer,
                    memo: '',
                    txid: Buffer.from(tx.id, 'hex'),
                    created_at_block: block.block_num,
                    created_at_time: eosioTimestampToDate(block.timestamp).getTime()
                }, ['contract', 'transfer_id']);

                await db.insert('simpleassets_transfers_assets', trace.act.data.assetids.map((assetID, index) => ({
                    transfer_id: trace.global_sequence,
                    contract: contract,
                    index: index + 1,
                    asset_id: assetID
                })), ['contract', 'transfer_id', 'asset_id']);
            }
        }, SimpleAssetsUpdatePriority.ACTION_UPDATE_ASSET.valueOf()
    ));

    return (): any => destructors.map(fn => fn());
}
