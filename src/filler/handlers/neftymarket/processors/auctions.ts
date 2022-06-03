import DataProcessor from '../../../processor';
import { ContractDBTransaction } from '../../../database';
import { EosioActionTrace, EosioContractRow, EosioTransaction } from '../../../../types/eosio';
import { ShipBlock } from '../../../../types/ship';
import { eosioTimestampToDate } from '../../../../utils/eosio';
import NeftyMarketHandler, { NeftyMarketUpdatePriority, AuctionState } from '../index';
import {
  AuctionBidActionData, ClaimAssetsActionData, ClaimWinBidActionData,
  EraseAuctionActionData,
  LogNewAuctionActionData
} from '../types/actions';
import { preventInt64Overflow } from '../../../../utils/binary';
import ApiNotificationSender from '../../../notifier';
import { AuctionsTableRow } from '../types/tables';
import logger from '../../../../utils/winston';
import {AuctionType} from '../../../../api/namespaces/neftymarket';

export function auctionProcessor(core: NeftyMarketHandler, processor: DataProcessor, notifier: ApiNotificationSender): () => any {
    const destructors: Array<() => any> = [];
    const contract = core.args.neftymarket_account;

    destructors.push(processor.onActionTrace(
        contract, 'lognewauct',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<LogNewAuctionActionData>): Promise<void> => {
            await db.insert('neftymarket_auctions', {
                market_contract: contract,
                auction_id: trace.act.data.auction_id,
                seller: trace.act.data.seller,
                buyer: null,
                price: preventInt64Overflow(trace.act.data.min_price.split(' ')[0].replace('.', '')),
                min_price: preventInt64Overflow(trace.act.data.min_price.split(' ')[0].replace('.', '')),
                buy_now_price: trace.act.data.buy_now_price ? preventInt64Overflow(trace.act.data.buy_now_price.split(' ')[0].replace('.', '')) : null,
                token_symbol: trace.act.data.min_price.split(' ')[1],
                assets_contract: core.args.atomicassets_account,
                collection_name: trace.act.data.collection_name,
                collection_fee: trace.act.data.collection_fee,
                claimed_by_buyer: false,
                claimed_by_seller: false,
                state: AuctionState.LISTED.valueOf(),
                auction_type: trace.act.data.auction_type,
                discount_rate: trace.act.data.discount_rate,
                discount_interval: trace.act.data.discount_interval * 1000,
                start_time: trace.act.data.start_time * 1000,
                end_time: trace.act.data.end_time * 1000,
                maker_marketplace: trace.act.data.marketplace || '',
                taker_marketplace: '',
                updated_at_block: block.block_num,
                updated_at_time: eosioTimestampToDate(block.timestamp).getTime(),
                created_at_block: block.block_num,
                created_at_time: eosioTimestampToDate(block.timestamp).getTime()
            }, ['market_contract', 'auction_id']);

            await db.insert('neftymarket_auctions_assets', trace.act.data.asset_ids.map((row, index) => ({
                market_contract: contract,
                auction_id: trace.act.data.auction_id,
                assets_contract: core.args.atomicassets_account,
                index: index + 1,
                asset_id: row
            })), [
                'market_contract', 'auction_id', 'assets_contract', 'asset_id'
            ]);

            notifier.sendActionTrace('auctions', block, tx, trace);
        }, NeftyMarketUpdatePriority.ACTION_CREATE_AUCTION.valueOf()
    ));

    destructors.push(processor.onContractRow(
        contract, 'auctions',
        async (db: ContractDBTransaction, block: ShipBlock, delta: EosioContractRow<AuctionsTableRow>): Promise<void> => {
            await db.update('neftymarket_auctions', {
                end_time: delta.value.end_time * 1000,
                claimed_by_buyer: delta.value.claimed_assets,
                claimed_by_seller: delta.value.claimed_win_bid,
                updated_at_block: block.block_num,
                updated_at_time: eosioTimestampToDate(block.timestamp).getTime()
            }, {
                str: 'market_contract = $1 AND auction_id = $2',
                values: [contract, delta.value.auction_id]
            }, ['market_contract', 'auction_id']);
        }, NeftyMarketUpdatePriority.TABLE_AUCTIONS.valueOf()
    ));

    destructors.push(processor.onActionTrace(
        contract, 'eraseauct',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<EraseAuctionActionData>): Promise<void> => {
            await db.update('neftymarket_auctions', {
                state: AuctionState.CANCELED.valueOf(),
                updated_at_block: block.block_num,
                updated_at_time: eosioTimestampToDate(block.timestamp).getTime()
            }, {
                str: 'market_contract = $1 AND auction_id = $2',
                values: [contract, trace.act.data.auction_id]
            }, ['market_contract', 'auction_id']);

            notifier.sendActionTrace('auctions', block, tx, trace);
        }, NeftyMarketUpdatePriority.ACTION_UPDATE_AUCTION.valueOf()
    ));

    destructors.push(processor.onActionTrace(
        contract, 'claimassets',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<ClaimAssetsActionData>): Promise<void> => {
          await db.update('neftymarket_auctions', {
            claimed_by_buyer: true,
            updated_at_block: block.block_num,
            updated_at_time: eosioTimestampToDate(block.timestamp).getTime()
          }, {
            str: 'market_contract = $1 AND auction_id = $2',
            values: [contract, trace.act.data.auction_id]
          }, ['market_contract', 'auction_id']);

          notifier.sendActionTrace('auctions', block, tx, trace);
        }, NeftyMarketUpdatePriority.ACTION_UPDATE_AUCTION.valueOf()
    ));

    destructors.push(processor.onActionTrace(
        contract, 'claimwinbid',
        async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<ClaimWinBidActionData>): Promise<void> => {
          await db.update('neftymarket_auctions', {
            claimed_by_seller: true,
            updated_at_block: block.block_num,
            updated_at_time: eosioTimestampToDate(block.timestamp).getTime()
          }, {
            str: 'market_contract = $1 AND auction_id = $2',
            values: [contract, trace.act.data.auction_id]
          }, ['market_contract', 'auction_id']);

          notifier.sendActionTrace('auctions', block, tx, trace);
        }, NeftyMarketUpdatePriority.ACTION_UPDATE_AUCTION.valueOf()
    ));

    const bidHandler = async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<AuctionBidActionData>): Promise<void> => {
      const auction = await db.query(
          'SELECT auction_type, buy_now_price FROM neftymarket_auctions WHERE market_contract = $1 AND auction_id = $2',
          [core.args.neftymarket_account, trace.act.data.auction_id]
      );

      if (auction.rowCount === 0) {
        logger.warn('NeftyMarket: Auction has bids but was not created');
        return;
      }

      const {
        auction_type: auctionType,
        buy_now_price: buyNowPrice,
        state,
      } = auction.rows[0];

      const bidAmount = BigInt(preventInt64Overflow(trace.act.data.bid_amount.split(' ')[0].replace('.', '')));
      const dutchAuction = auctionType === AuctionType.DUTCH.valueOf();
      const buyNowPricePaid = (buyNowPrice > 0 && bidAmount >= buyNowPrice);
      const newState = dutchAuction || buyNowPricePaid ? AuctionState.SOLD.valueOf()
        : state || AuctionState.LISTED.valueOf();
      
      await db.update('neftymarket_auctions', {
        buyer: trace.act.data.bidder,
        price: bidAmount,
        token_symbol: trace.act.data.bid_amount.split(' ')[1],
        taker_marketplace: trace.act.data.marketplace || '',
        updated_at_block: block.block_num,
        updated_at_time: eosioTimestampToDate(block.timestamp).getTime(),
        claimed_by_buyer: dutchAuction || buyNowPricePaid,
        claimed_by_seller: dutchAuction || buyNowPricePaid,
        state: newState,
      }, {
        str: 'market_contract = $1 AND auction_id = $2',
        values: [contract, trace.act.data.auction_id]
      }, ['market_contract', 'auction_id']);

      const bidCount = await db.query(
          'SELECT COUNT(*) FROM neftymarket_auctions_bids WHERE market_contract = $1 AND auction_id = $2',
          [contract, trace.act.data.auction_id]
      );

      await db.insert('neftymarket_auctions_bids', {
        market_contract: contract,
        auction_id: trace.act.data.auction_id,
        bid_number: parseInt(bidCount.rows[0].count, 10) + 1,
        account: trace.act.data.bidder,
        amount: preventInt64Overflow(trace.act.data.bid_amount.split(' ')[0].replace('.', '')),
        txid: Buffer.from(tx.id, 'hex'),
        created_at_block: block.block_num,
        created_at_time: eosioTimestampToDate(block.timestamp).getTime()
      }, ['market_contract', 'auction_id', 'bid_number']);

      notifier.sendActionTrace('auctions', block, tx, trace);
    };

    destructors.push(processor.onActionTrace(
        contract, 'bid', bidHandler,
        NeftyMarketUpdatePriority.ACTION_UPDATE_AUCTION.valueOf()
    ));

    destructors.push(processor.onActionTrace(
        contract, 'bidsecure', bidHandler,
        NeftyMarketUpdatePriority.ACTION_UPDATE_AUCTION.valueOf()
    ));

    return (): any => destructors.map(fn => fn());
}
