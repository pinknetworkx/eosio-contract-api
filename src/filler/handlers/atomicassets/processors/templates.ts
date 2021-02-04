import AtomicAssetsHandler, { AtomicAssetsUpdatePriority } from '../index';
import DataProcessor from '../../../processor';
import { ContractDBTransaction } from '../../../database';
import { EosioContractRow } from '../../../../types/eosio';
import { ShipBlock } from '../../../../types/ship';
import { eosioTimestampToDate } from '../../../../utils/eosio';
import { TemplatesTableRow } from '../types/tables';
import { deserialize, ObjectSchema } from 'atomicassets';

export function templateProcessor(core: AtomicAssetsHandler, processor: DataProcessor): () => any {
    const destructors: Array<() => any> = [];
    const contract = core.args.atomicassets_account;

    destructors.push(processor.onContractRow(
        contract, 'templates',
        async (db: ContractDBTransaction, block: ShipBlock, delta: EosioContractRow<TemplatesTableRow>): Promise<void> => {
            if (!delta.present) {
                throw new Error('AtomicAssets: A template was deleted. Should not be possible by contract');
            }

            const templateQuery = await db.query(
                'SELECT contract, collection_name, schema_name FROM atomicassets_templates WHERE contract = $1 AND template_id = $2',
                [contract, delta.value.template_id]
            );

            if (templateQuery.rowCount > 0) {
                await db.update('atomicassets_templates', {
                    transferable: delta.value.transferable,
                    burnable: delta.value.burnable,
                    max_supply: delta.value.max_supply,
                    issued_supply: delta.value.issued_supply,
                }, {
                    str: 'contract = $1 AND template_id = $2',
                    values: [contract, delta.value.template_id]
                }, ['contract', 'template_id']);
            } else {
                const schemaQuery = await db.query(
                    'SELECT format FROM atomicassets_schemas WHERE contract = $1 AND collection_name = $2 AND schema_name = $3',
                    [contract, delta.scope, delta.value.schema_name]
                );

                if (schemaQuery.rowCount === 0) {
                    throw new Error('AtomicAssets: Schema of template not found. Should not be possible by contract');
                }

                let byteData;
                if (typeof delta.value.immutable_serialized_data === 'string') {
                    byteData = Uint8Array.from(Buffer.from(delta.value.immutable_serialized_data, 'hex'));
                } else {
                    byteData = new Uint8Array(delta.value.immutable_serialized_data);
                }

                const immutableData = deserialize(byteData, ObjectSchema(schemaQuery.rows[0].format));

                await db.insert('atomicassets_templates', {
                    contract: contract,
                    template_id: delta.value.template_id,
                    collection_name: delta.scope,
                    schema_name: delta.value.schema_name,
                    transferable: delta.value.transferable,
                    burnable: delta.value.burnable,
                    max_supply: delta.value.max_supply,
                    issued_supply: delta.value.issued_supply,
                    immutable_data: JSON.stringify(immutableData),
                    created_at_block: block.block_num,
                    created_at_time: eosioTimestampToDate(block.timestamp).getTime()
                }, ['contract', 'template_id']);
            }
        }, AtomicAssetsUpdatePriority.TABLE_TEMPLATES.valueOf()
    ));

    return (): any => destructors.map(fn => fn());
}
