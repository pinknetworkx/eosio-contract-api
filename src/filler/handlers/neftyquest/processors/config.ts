import DataProcessor from '../../../processor';
import { ContractDBTransaction } from '../../../database';
import { EosioContractRow } from '../../../../types/eosio';
import { ShipBlock } from '../../../../types/ship';
import { ConfigTableRow } from '../types/tables';
import NeftyQuestHandler, {NeftyQuestUpdatePriority} from '../index';
import {preventInt64Overflow} from '../../../../utils/binary';

export function configProcessor(core: NeftyQuestHandler, processor: DataProcessor): () => any {
    const destructors: Array<() => any> = [];
    const contract = core.args.neftyquest_account;

    destructors.push(processor.onContractRow(
        contract, 'config',
        async (db: ContractDBTransaction, block: ShipBlock, delta: EosioContractRow<ConfigTableRow>): Promise<void> => {
            if (!delta.present) {
                await db.query(
                    'DELETE FROM neftyquest_config WHERE contract = $1',
                    [contract]
                );
            }

            const config = await db.query(
                'SELECT * FROM neftyquest_config WHERE contract = $1',
                [contract]
            );

            if (config.rows.length > 0) {
                await db.update('neftyquest_config', {
                    contract: contract,
                    collection_name: delta.value.collection_name,
                    template_id: delta.value.template_id,
                    balance_attribute_name: delta.value.balance_attribute_name,
                    quest_duration: delta.value.quest_duration,
                    points_per_asset: delta.value.points_per_asset,
                    min_asset_value: preventInt64Overflow(delta.value.min_asset_value.split(' ')[0].replace('.', '')),
                    min_asset_value_symbol: delta.value.min_asset_value.split(' ')[1],
                    points_per_volume: delta.value.points_per_volume,
                    volume_threshold: preventInt64Overflow(delta.value.volume_threshold.split(' ')[0].replace('.', '')),
                    volume_threshold_symbol: delta.value.volume_threshold.split(' ')[1],
                    minimum_volume: preventInt64Overflow(delta.value.minimum_volume.split(' ')[0].replace('.', '')),
                    minimum_volume_symbol: delta.value.minimum_volume.split(' ')[1],
                    quest_attribute_name: delta.value.quest_attribute_name,
                }, {
                    str: 'contract = $1',
                    values: [contract]
                }, ['contract']);
            } else {
                await db.query(
                    'INSERT INTO neftyquest_config ' +
                    '(' +
                    'contract, collection_name, template_id, ' +
                    'balance_attribute_name, quest_duration, points_per_asset, ' +
                    'min_asset_value, min_asset_value_symbol, points_per_volume, volume_threshold, ' +
                    'volume_threshold_symbol, minimum_volume, minimum_volume_symbol, quest_attribute_name ' +
                    ') ' +
                    'VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)',
                    [
                        contract,
                        delta.value.collection_name,
                        delta.value.template_id,
                        delta.value.balance_attribute_name,
                        delta.value.quest_duration,
                        delta.value.points_per_asset,
                        preventInt64Overflow(delta.value.min_asset_value.split(' ')[0].replace('.', '')),
                        delta.value.min_asset_value.split(' ')[1],
                        delta.value.points_per_volume,
                        preventInt64Overflow(delta.value.volume_threshold.split(' ')[0].replace('.', '')),
                        delta.value.volume_threshold.split(' ')[1],
                        preventInt64Overflow(delta.value.minimum_volume.split(' ')[0].replace('.', '')),
                        delta.value.minimum_volume.split(' ')[1],
                        delta.value.quest_attribute_name,
                    ]
                );
            }
            core.config = delta.value;
        }, NeftyQuestUpdatePriority.TABLE_CONFIG.valueOf()
    ));

    return (): any => destructors.map(fn => fn());
}
