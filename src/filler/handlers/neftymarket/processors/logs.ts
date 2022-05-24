import { NeftyMarketUpdatePriority } from '../index';
import DataProcessor from '../../../processor';
import { ContractDBTransaction } from '../../../database';
import { EosioActionTrace, EosioTransaction } from '../../../../types/eosio';
import { ShipBlock } from '../../../../types/ship';
import NeftyMarketHandler from '../index';
import {
    LogNewAuctionActionData,
} from '../types/actions';

export function logProcessor(core: NeftyMarketHandler, processor: DataProcessor): () => any {
    const destructors: Array<() => any> = [];
    const contract = core.args.neftymarket_account;

    /* AUCTIONS */
    destructors.push(processor.onActionTrace(
        contract, 'lognewauct',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<LogNewAuctionActionData>): Promise<void> => {
            await db.logTrace(block, tx, trace, {
                auction_id: trace.act.data.auction_id,
                min_price: trace.act.data.min_price,
                buy_now_price: trace.act.data.buy_now_price,
                collection_fee: trace.act.data.collection_fee
            });
        }, NeftyMarketUpdatePriority.LOGS.valueOf()
    ));

    return (): any => destructors.map(fn => fn());
}
