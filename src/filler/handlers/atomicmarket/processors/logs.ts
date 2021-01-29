import { AtomicMarketUpdatePriority } from '../index';
import DataProcessor from '../../../processor';
import { ContractDBTransaction } from '../../../database';
import { EosioActionTrace, EosioTransaction } from '../../../../types/eosio';
import { ShipBlock } from '../../../../types/ship';
import AtomicMarketHandler from '../index';
import {
    AcceptBuyofferActionData,
    AuctionClaimBuyerActionData,
    AuctionClaimSellerActionData,
    CancelAuctionActionData, CancelBuyofferActionData, CancelSaleActionData, DeclineBuyofferActionData,
    LogAuctionStartActionData,
    LogNewAuctionActionData, LogNewBuyofferActionData, LogNewSaleActionData, LogSaleStartActionData, PurchaseSaleActionData
} from '../types/actions';

export function logProcessor(core: AtomicMarketHandler, processor: DataProcessor): () => any {
    const destructors: Array<() => any> = [];
    const contract = core.args.atomicmarket_account;

    /* AUCTIONS */
    destructors.push(processor.onTrace(
        contract, 'lognewauct',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<LogNewAuctionActionData>): Promise<void> => {
            await db.logTrace(block, tx, trace, {
                auction_id: trace.act.data.auction_id,
                starting_bid: trace.act.data.starting_bid,
                maker_marketplace: trace.act.data.maker_marketplace,
                collection_fee: trace.act.data.collection_fee
            });
        }, AtomicMarketUpdatePriority.LOGS.valueOf()
    ));

    destructors.push(processor.onTrace(
        contract, 'logauctstart',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<LogAuctionStartActionData>): Promise<void> => {
            await db.logTrace(block, tx, trace, trace.act.data);
        }, AtomicMarketUpdatePriority.LOGS.valueOf()
    ));

    destructors.push(processor.onTrace(
        contract, 'cancelauct',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<CancelAuctionActionData>): Promise<void> => {
            await db.logTrace(block, tx, trace, trace.act.data);
        }, AtomicMarketUpdatePriority.LOGS.valueOf()
    ));

    destructors.push(processor.onTrace(
        contract, 'auctclaimbuy',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<AuctionClaimBuyerActionData>): Promise<void> => {
            await db.logTrace(block, tx, trace, trace.act.data);
        }, AtomicMarketUpdatePriority.LOGS.valueOf()
    ));

    destructors.push(processor.onTrace(
        contract, 'auctclaimsel',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<AuctionClaimSellerActionData>): Promise<void> => {
            await db.logTrace(block, tx, trace, trace.act.data);
        }, AtomicMarketUpdatePriority.LOGS.valueOf()
    ));

    /* SALES */
    destructors.push(processor.onTrace(
        contract, 'lognewsale',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<LogNewSaleActionData>): Promise<void> => {
            await db.logTrace(block, tx, trace, {
                sale_id: trace.act.data.sale_id,
                maker_marketplace: trace.act.data.maker_marketplace,
                collection_fee: trace.act.data.collection_fee
            });
        }, AtomicMarketUpdatePriority.LOGS.valueOf()
    ));

    destructors.push(processor.onTrace(
        contract, 'logsalestart',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<LogSaleStartActionData>): Promise<void> => {
            await db.logTrace(block, tx, trace, trace.act.data);
        }, AtomicMarketUpdatePriority.LOGS.valueOf()
    ));

    destructors.push(processor.onTrace(
        contract, 'cancelsale',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<CancelSaleActionData>): Promise<void> => {
            await db.logTrace(block, tx, trace, trace.act.data);
        }, AtomicMarketUpdatePriority.LOGS.valueOf()
    ));

    destructors.push(processor.onTrace(
        contract, 'purchasesale',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<PurchaseSaleActionData>): Promise<void> => {
            await db.logTrace(block, tx, trace, {
                sale_id: trace.act.data.sale_id,
                taker_marketplace: trace.act.data.taker_marketplace,
                intended_delphi_median: trace.act.data.intended_delphi_median
            });
        }, AtomicMarketUpdatePriority.LOGS.valueOf()
    ));

    /* BUYOFFERS */
    destructors.push(processor.onTrace(
        contract, 'lognewbuyo',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<LogNewBuyofferActionData>): Promise<void> => {
            await db.logTrace(block, tx, trace, {
                buyoffer_id: trace.act.data.buyoffer_id,
                maker_marketplace: trace.act.data.maker_marketplace,
                collection_fee: trace.act.data.collection_fee
            });
        }, AtomicMarketUpdatePriority.LOGS.valueOf()
    ));

    destructors.push(processor.onTrace(
        contract, 'cancelbuyo',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<CancelBuyofferActionData>): Promise<void> => {
            await db.logTrace(block, tx, trace, {
                buyoffer_id: trace.act.data.buyoffer_id
            });
        }, AtomicMarketUpdatePriority.LOGS.valueOf()
    ));

    destructors.push(processor.onTrace(
        contract, 'acceptbuyo',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<AcceptBuyofferActionData>): Promise<void> => {
            await db.logTrace(block, tx, trace, {
                buyoffer_id: trace.act.data.buyoffer_id,
                taker_marketplace: trace.act.data.taker_marketplace
            });
        }, AtomicMarketUpdatePriority.LOGS.valueOf()
    ));

    destructors.push(processor.onTrace(
        contract, 'declinebuyo',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<DeclineBuyofferActionData>): Promise<void> => {
            await db.logTrace(block, tx, trace, {
                buyoffer_id: trace.act.data.buyoffer_id
            });
        }, AtomicMarketUpdatePriority.LOGS.valueOf()
    ));

    return (): any => destructors.map(fn => fn());
}
