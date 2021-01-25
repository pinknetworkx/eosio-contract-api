import DataProcessor from '../../../processor';
import { ContractDBTransaction } from '../../../database';
import { EosioTableRow } from '../../../../types/eosio';
import { ShipBlock } from '../../../../types/ship';
import { eosioTimestampToDate, splitEosioToken } from '../../../../utils/eosio';
import { BalancesTableRow } from '../types/tables';
import AtomicMarketHandler, { AtomicMarketUpdatePriority } from '../index';

export function balanceProcessor(core: AtomicMarketHandler, processor: DataProcessor): () => any {
    const destructors: Array<() => any> = [];
    const contract = core.args.atomicmarket_account;

    destructors.push(processor.onDelta(
        contract, 'balances',
        async (db: ContractDBTransaction, block: ShipBlock, delta: EosioTableRow<BalancesTableRow>): Promise<void> => {
            await db.delete('atomicmarket_balances', {
                str: 'market_contract = $1 AND owner = $2',
                values: [contract, delta.value.owner]
            });

            if (delta.present) {
                await db.insert('atomicmarket_balances', delta.value.quantities.map(quantity => {
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
        }, AtomicMarketUpdatePriority.TABLE_BALANCES
    ));

    return (): any => destructors.map(fn => fn());
}
