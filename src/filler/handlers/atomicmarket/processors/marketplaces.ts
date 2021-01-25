import DataProcessor from '../../../processor';
import { ContractDBTransaction } from '../../../database';
import { EosioTableRow } from '../../../../types/eosio';
import { ShipBlock } from '../../../../types/ship';
import { eosioTimestampToDate } from '../../../../utils/eosio';
import { MarketplacesTableRow } from '../types/tables';
import AtomicMarketHandler, { AtomicMarketUpdatePriority } from '../index';

export function marketplaceProcessor(core: AtomicMarketHandler, processor: DataProcessor): () => any {
    const destructors: Array<() => any> = [];
    const contract = core.args.atomicmarket_account;

    destructors.push(processor.onDelta(
        contract, 'marketplaces',
        async (db: ContractDBTransaction, block: ShipBlock, delta: EosioTableRow<MarketplacesTableRow>): Promise<void> => {
            if (!delta.present) {
                throw new Error('AtomicMarket: Marketplace deleted. Should not be possible');
            }

            await db.replace('atomicmarket_marketplaces', {
                market_contract: core.args.atomicmarket_account,
                marketplace_name: delta.value.marketplace_name,
                creator: delta.value.creator,
                created_at_block: block.block_num,
                created_at_time: eosioTimestampToDate(block.timestamp).getTime()
            }, ['market_contract', 'marketplace_name'], ['created_at_block', 'created_at_time']);
        }, AtomicMarketUpdatePriority.TABLE_MARKETPLACES
    ));

    return (): any => destructors.map(fn => fn());
}
