import DataProcessor from '../../../processor';
import { ContractDBTransaction } from '../../../database';
import { EosioContractRow } from '../../../../types/eosio';
import { ShipBlock } from '../../../../types/ship';
import { eosioTimestampToDate, splitEosioToken } from '../../../../utils/eosio';
import { BalancesTableRow } from '../types/tables';
import NeftyMarketHandler, { NeftyMarketUpdatePriority } from '../index';

export function balanceProcessor(core: NeftyMarketHandler, processor: DataProcessor): () => any {
    const destructors: Array<() => any> = [];
    const contract = core.args.neftymarket_account;

    destructors.push(processor.onContractRow(
        contract, 'balances',
        async (db: ContractDBTransaction, block: ShipBlock, delta: EosioContractRow<BalancesTableRow>): Promise<void> => {
            await db.delete('neftymarket_balances', {
                str: 'market_contract = $1 AND owner = $2',
                values: [contract, delta.value.owner]
            });

            if (delta.present && delta.value.quantities.length > 0) {
                await db.insert('neftymarket_balances', delta.value.quantities.map(quantity => {
                    const token = splitEosioToken(quantity);

                    return {
                        market_contract: contract,
                        owner: delta.value.owner,
                        token_symbol: token.token_symbol,
                        amount: token.amount,
                        updated_at_block: block.block_num,
                        updated_at_time: eosioTimestampToDate(block.timestamp).getTime(),
                    };
                }), ['market_contract', 'owner']);
            }
        }, NeftyMarketUpdatePriority.TABLE_BALANCES.valueOf()
    ));

    return (): any => destructors.map(fn => fn());
}
