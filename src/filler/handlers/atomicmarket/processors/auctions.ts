import DataProcessor from '../../../processor';
import { ContractDBTransaction } from '../../../database';
import { EosioActionTrace, EosioTableRow, EosioTransaction } from '../../../../types/eosio';
import { ShipBlock } from '../../../../types/ship';
import { eosioTimestampToDate } from '../../../../utils/eosio';
import AtomicMarketHandler, { AtomicMarketUpdatePriority, AuctionState } from '../index';
import {
    AuctionBidActionData,
    AuctionClaimBuyerActionData, AuctionClaimSellerActionData,
    CancelAuctionActionData,
    LogAuctionStartActionData,
    LogNewAuctionActionData
} from '../types/actions';
import { preventInt64Overflow } from '../../../../utils/binary';
import ApiNotificationSender from '../../../notifier';
import { AuctionsTableRow } from '../types/tables';

export function auctionProcessor(core: AtomicMarketHandler, processor: DataProcessor, notifier: ApiNotificationSender): () => any {
    const destructors: Array<() => any> = [];
    const contract = core.args.atomicmarket_account;

    destructors.push(processor.onTrace(
        contract, 'lognewauct',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<LogNewAuctionActionData>): Promise<void> => {
            await db.insert('atomicmarket_auctions', {
                market_contract: contract,
                auction_id: trace.act.data.auction_id,
                seller: trace.act.data.seller,
                buyer: null,
                price: preventInt64Overflow(trace.act.data.starting_bid.split(' ')[0].replace('.', '')),
                token_symbol: trace.act.data.starting_bid.split(' ')[1],
                assets_contract: core.args.atomicassets_account,
                maker_marketplace: trace.act.data.maker_marketplace,
                taker_marketplace: null,
                collection_name: trace.act.data.collection_name,
                collection_fee: trace.act.data.collection_fee,
                claimed_by_buyer: false,
                claimed_by_seller: false,
                state: AuctionState.WAITING.valueOf(),
                end_time: trace.act.data.end_time,
                updated_at_block: block.block_num,
                updated_at_time: eosioTimestampToDate(block.timestamp).getTime(),
                created_at_block: block.block_num,
                created_at_time: eosioTimestampToDate(block.timestamp).getTime()
            }, ['market_contract', 'auction_id']);

            await db.insert('atomicmarket_auctions_assets', trace.act.data.asset_ids.map((row, index) => ({
                market_contract: contract,
                auction_id: trace.act.data.auction_id,
                assets_contract: core.args.atomicassets_account,
                index: index + 1,
                asset_id: row
            })), [
                'market_contract', 'auction_id', 'assets_contract', 'asset_id'
            ]);

            notifier.sendTrace('auctions', block, tx, trace);
        }, AtomicMarketUpdatePriority.ACTION_CREATE_AUCTION.valueOf()
    ));

    destructors.push(processor.onTableUpdate(
        contract, 'auctions',
        async (db: ContractDBTransaction, block: ShipBlock, delta: EosioTableRow<AuctionsTableRow>): Promise<void> => {
            await db.update('atomicmarket_auctions', {
                end_time: delta.value.end_time,
                updated_at_block: block.block_num,
                updated_at_time: eosioTimestampToDate(block.timestamp).getTime()
            }, {
                str: 'market_contract = $1 AND auction_id = $2',
                values: [contract, delta.value.auction_id]
            }, ['market_contract', 'auction_id']);
        }, AtomicMarketUpdatePriority.TABLE_AUCTIONS.valueOf()
    ));

    destructors.push(processor.onTrace(
        contract, 'logauctstart',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<LogAuctionStartActionData>): Promise<void> => {
            await db.update('atomicmarket_auctions', {
                state: AuctionState.LISTED.valueOf(),
                updated_at_block: block.block_num,
                updated_at_time: eosioTimestampToDate(block.timestamp).getTime()
            }, {
                str: 'market_contract = $1 AND auction_id = $2',
                values: [contract, trace.act.data.auction_id]
            }, ['market_contract', 'auction_id']);

            notifier.sendTrace('auctions', block, tx, trace);
        }, AtomicMarketUpdatePriority.ACTION_UPDATE_AUCTION.valueOf()
    ));

    destructors.push(processor.onTrace(
        contract, 'cancelauct',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<CancelAuctionActionData>): Promise<void> => {
            await db.update('atomicmarket_auctions', {
                state: AuctionState.CANCELED.valueOf(),
                updated_at_block: block.block_num,
                updated_at_time: eosioTimestampToDate(block.timestamp).getTime()
            }, {
                str: 'market_contract = $1 AND auction_id = $2',
                values: [contract, trace.act.data.auction_id]
            }, ['market_contract', 'auction_id']);

            notifier.sendTrace('auctions', block, tx, trace);
        }, AtomicMarketUpdatePriority.ACTION_UPDATE_AUCTION.valueOf()
    ));

    destructors.push(processor.onTrace(
        contract, 'auctionbid',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<AuctionBidActionData>): Promise<void> => {
            await db.update('atomicmarket_auctions', {
                buyer: trace.act.data.bidder,
                price: preventInt64Overflow(trace.act.data.bid.split(' ')[0].replace('.', '')),
                token_symbol: trace.act.data.bid.split(' ')[1],
                taker_marketplace: trace.act.data.taker_marketplace,
                updated_at_block: block.block_num,
                updated_at_time: eosioTimestampToDate(block.timestamp).getTime()
            }, {
                str: 'market_contract = $1 AND auction_id = $2',
                values: [contract, trace.act.data.auction_id]
            }, ['market_contract', 'auction_id']);

            const bidCount = await db.query(
                'SELECT COUNT(*) FROM atomicmarket_auctions_bids WHERE market_contract = $1 AND auction_id = $2',
                [contract, trace.act.data.auction_id]
            );

            await db.insert('atomicmarket_auctions_bids', {
                market_contract: contract,
                auction_id: trace.act.data.auction_id,
                bid_number: parseInt(bidCount.rows[0].count, 10) + 1,
                account: trace.act.data.bidder,
                amount: preventInt64Overflow(trace.act.data.bid.split(' ')[0].replace('.', '')),
                txid: Buffer.from(tx.id, 'hex'),
                created_at_block: block.block_num,
                created_at_time: eosioTimestampToDate(block.timestamp).getTime()
            }, ['market_contract', 'auction_id', 'bid_number']);

            notifier.sendTrace('auctions', block, tx, trace);
        }, AtomicMarketUpdatePriority.ACTION_UPDATE_AUCTION.valueOf()
    ));

    destructors.push(processor.onTrace(
        contract, 'auctclaimbuy',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<AuctionClaimBuyerActionData>): Promise<void> => {
            await db.update('atomicmarket_auctions', {
                claimed_by_buyer: true,
                updated_at_block: block.block_num,
                updated_at_time: eosioTimestampToDate(block.timestamp).getTime()
            }, {
                str: 'market_contract = $1 AND auction_id = $2',
                values: [contract, trace.act.data.auction_id]
            }, ['market_contract', 'auction_id']);
        }, AtomicMarketUpdatePriority.ACTION_UPDATE_AUCTION.valueOf()
    ));

    destructors.push(processor.onTrace(
        contract, 'auctclaimsel',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<AuctionClaimSellerActionData>): Promise<void> => {
            await db.update('atomicmarket_auctions', {
                claimed_by_seller: true,
                updated_at_block: block.block_num,
                updated_at_time: eosioTimestampToDate(block.timestamp).getTime()
            }, {
                str: 'market_contract = $1 AND auction_id = $2',
                values: [contract, trace.act.data.auction_id]
            }, ['market_contract', 'auction_id']);
        }, AtomicMarketUpdatePriority.ACTION_UPDATE_AUCTION.valueOf()
    ));


    return (): any => destructors.map(fn => fn());
}
