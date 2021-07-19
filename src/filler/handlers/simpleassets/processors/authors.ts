import SimpleAssetsHandler, { SimpleAssetsUpdatePriority } from '../index';
import DataProcessor from '../../../processor';
import { ContractDBTransaction } from '../../../database';
import { EosioContractRow } from '../../../../types/eosio';
import { ShipBlock } from '../../../../types/ship';
import { eosioTimestampToDate } from '../../../../utils/eosio';
import { AuthorsTableRow } from '../types/tables';
import { parseJsonObject } from '../../../../utils/binary';
import { encodeDatabaseJson } from '../../../utils';

export function authorProcessor(core: SimpleAssetsHandler, processor: DataProcessor): () => any {
    const destructors: Array<() => any> = [];
    const contract = core.args.simpleassets_account;

    destructors.push(processor.onContractRow(
        contract, 'authors',
        async (db: ContractDBTransaction, block: ShipBlock, delta: EosioContractRow<AuthorsTableRow>): Promise<void> => {
            if (!delta.present) {
                await db.delete('simpleassets_authors', {
                    str: 'contract = $1 AND author = $2',
                    values: [contract, delta.value.author]
                });
            } else {
                await db.replace('simpleassets_authors', {
                    contract: contract,
                    author: delta.value.author,
                    dappinfo: encodeDatabaseJson(parseJsonObject(delta.value.dappinfo)),
                    fieldtypes: encodeDatabaseJson(parseJsonObject(delta.value.fieldtypes)),
                    priorityimg: encodeDatabaseJson(parseJsonObject(delta.value.priorityimg)),
                    created_at_block: block.block_num,
                    created_at_time: eosioTimestampToDate(block.timestamp).getTime()
                }, ['contract', 'author'], ['created_at_block', 'created_at_time']);
            }
        }, SimpleAssetsUpdatePriority.TABLE_AUTHORS.valueOf()
    ));

    return (): any => destructors.map(fn => fn());
}
