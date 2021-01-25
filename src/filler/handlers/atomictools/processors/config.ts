import AtomicToolsHandler, { AtomicToolsUpdatePriority } from '../index';
import DataProcessor from '../../../processor';
import { ContractDBTransaction } from '../../../database';
import { ShipBlock } from '../../../../types/ship';
import { EosioTableRow } from '../../../../types/eosio';
import { ConfigTableRow } from '../types/tables';

export function configProcessor(core: AtomicToolsHandler, processor: DataProcessor): () => any {
    const destructors: Array<() => any> = [];

    destructors.push(processor.onDelta(
        core.args.atomictools_account, 'config',
        async (db: ContractDBTransaction, block: ShipBlock, delta: EosioTableRow<ConfigTableRow>): Promise<void> => {
            if (!delta.present) {
                throw new Error('AtomicTools: Config should not be deleted');
            }

            if (core.config.version !== delta.value.version) {
                await db.update('atomictools_config', {
                    version: delta.value.version
                }, {
                    str: 'tools_contract = $1',
                    values: [core.args.atomictools_account]
                }, ['tools_contract']);
            }

            core.config = delta.value;
        }, AtomicToolsUpdatePriority.TABLE_CONFIG
    ));

    return (): any => destructors.map(fn => fn());
}
