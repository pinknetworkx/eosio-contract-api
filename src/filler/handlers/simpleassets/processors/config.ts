import { SIMPLEASSETS_BASE_PRIORITY } from '../index';
import DataProcessor from '../../../processor';
import { ContractDBTransaction } from '../../../database';
import { EosioContractRow } from '../../../../types/eosio';
import { ShipBlock } from '../../../../types/ship';
import { TokenConfigsTableRow } from '../types/tables';
import SimpleAssetsHandler from '../index';

export function configProcessor(core: SimpleAssetsHandler, processor: DataProcessor): () => any {
    const destructors: Array<() => any> = [];
    const contract = core.args.simpleassets_account;

    destructors.push(processor.onContractRow(
        contract, 'tokenconfigs',
        async (db: ContractDBTransaction, block: ShipBlock, delta: EosioContractRow<TokenConfigsTableRow>): Promise<void> => {
            if (!delta.present) {
                throw new Error('SimpleAassets: tokenconfigs row was deleted. Should not be possible by contract');
            }

            if (core.tokenconfigs.version !== delta.value.version) {
                await db.update('simpleassets_config', {
                    version: delta.value.version
                }, {
                    str: 'contract = $1',
                    values: [contract]
                }, ['contract']);
            }

            core.tokenconfigs = delta.value;
        }, SIMPLEASSETS_BASE_PRIORITY
    ));

    return (): any => destructors.map(fn => fn());
}
