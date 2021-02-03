import DataProcessor from '../../../processor';
import { ContractDBTransaction } from '../../../database';
import { EosioTableRow } from '../../../../types/eosio';
import { ShipBlock } from '../../../../types/ship';
import { eosioTimestampToDate } from '../../../../utils/eosio';
import { BonusfeesTableRow } from '../types/tables';
import AtomicMarketHandler, { AtomicMarketUpdatePriority } from '../index';

export function bonusfeeProcessor(core: AtomicMarketHandler, processor: DataProcessor): () => any {
    const destructors: Array<() => any> = [];
    const contract = core.args.atomicmarket_account;

    destructors.push(processor.onTableUpdate(
        contract, 'bonusfees',
        async (db: ContractDBTransaction, block: ShipBlock, delta: EosioTableRow<BonusfeesTableRow>): Promise<void> => {
            if (!delta.present) {
                await db.delete('atomicmarket_bonusfees', {
                    str: 'market_contract = $1 AND bonusfee_id = $2',
                    values: [contract, delta.value.bonusfee_id]
                });

                return;
            }

            const saleCounter = delta.value.counter_ranges.find(row => row.counter_name === 'sale');
            const auctionCounter = delta.value.counter_ranges.find(row => row.counter_name === 'auction');
            const buyofferCounter = delta.value.counter_ranges.find(row => row.counter_name === 'buyoffer');

            await db.replace('atomicmarket_bonusfees', {
                market_contract: contract,
                bonusfee_id: delta.value.bonusfee_id,
                name: delta.value.fee_name.substr(0, 256),
                recipient: delta.value.fee_recipient,
                fee: delta.value.fee,
                start_sale_id: saleCounter ? saleCounter.start_id : null,
                end_sale_id: (saleCounter && saleCounter.end_id !== '18446744073709551615') ? saleCounter.end_id : null,
                start_auction_id: auctionCounter ? auctionCounter.start_id : null,
                end_auction_id: (auctionCounter && auctionCounter.end_id !== '18446744073709551615') ? auctionCounter.end_id : null,
                start_buyoffer_id: buyofferCounter ? buyofferCounter.start_id : null,
                end_buyoffer_id: (buyofferCounter && buyofferCounter.end_id !== '18446744073709551615') ? buyofferCounter.end_id : null,
                created_at_block: block.block_num,
                created_at_time: eosioTimestampToDate(block.timestamp).getTime()
            }, ['market_contract', 'bonusfee_id'], ['created_at_block', 'created_at_time']);
        }, AtomicMarketUpdatePriority.TABLE_BONUSFEES.valueOf()
    ));

    return (): any => destructors.map(fn => fn());
}
