import AtomicAssetsHandler, { AtomicAssetsUpdatePriority } from '../index';
import DataProcessor from '../../../processor';
import { ContractDBTransaction } from '../../../database';
import { EosioTableRow } from '../../../../types/eosio';
import { ShipBlock } from '../../../../types/ship';
import { eosioTimestampToDate } from '../../../../utils/eosio';
import { CollectionsTableRow } from '../types/tables';
import { deserialize, ObjectSchema } from 'atomicassets';

export function collectionProcessor(core: AtomicAssetsHandler, processor: DataProcessor): () => any {
    const destructors: Array<() => any> = [];
    const contract = core.args.atomicassets_account;

    destructors.push(processor.onDelta(
        contract, 'collections',
        async (db: ContractDBTransaction, block: ShipBlock, delta: EosioTableRow<CollectionsTableRow>): Promise<void> => {
            if (!delta.present) {
                throw new Error('AtomicAssets: A collection was deleted. Should not be possible by contract');
            }

            let byteData;
            if (typeof delta.value.serialized_data === 'string') {
                byteData = Uint8Array.from(Buffer.from(delta.value.serialized_data, 'hex'));
            } else {
                byteData = new Uint8Array(delta.value.serialized_data);
            }

            const deserializedData = deserialize(byteData, ObjectSchema(core.config.collection_format));

            await db.replace('atomicassets_collections', {
                contract: contract,
                collection_name: delta.value.collection_name,
                author: delta.value.author,
                allow_notify: delta.value.allow_notify,
                authorized_accounts: delta.value.authorized_accounts,
                notify_accounts: delta.value.notify_accounts,
                market_fee: delta.value.market_fee,
                data: JSON.stringify(deserializedData),
                created_at_block: block.block_num,
                created_at_time: eosioTimestampToDate(block.timestamp).getTime()
            }, ['contract', 'collection_name'], ['created_at_block', 'created_at_time']);
        }, AtomicAssetsUpdatePriority.TABLE_COLLECTIONS
    ));

    return (): any => destructors.map(fn => fn());
}
