import AtomicMarketHandler, { AuctionState, JobPriority, SaleState } from './index';
import { ContractDBTransaction } from '../../database';
import { ShipBlock } from '../../../types/ship';
import { EosioActionTrace, EosioTransaction } from '../../../types/eosio';
import logger from '../../../utils/winston';
import {
    AuctionBidActionData,
    AuctionClaimBuyerActionData,
    AuctionClaimSellerActionData, CancelAuctionActionData,
    CancelSaleActionData, LogAuctionStartActionData,
    LogNewAuctionActionData,
    LogNewSaleActionData,
    LogSaleStartActionData,
    PurchaseSaleActionData
} from './types/actions';
import { eosioTimestampToDate } from '../../../utils/eosio';

export default class AtomicMarketActionHandler {
    private readonly contractName: string;

    constructor(readonly core: AtomicMarketHandler) {
        this.contractName = this.core.args.atomicmarket_account;
    }

    async handleTrace(db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace, tx: EosioTransaction): Promise<void> {
        if (trace.act.account !== this.core.args.atomicmarket_account) {
            logger.error('AtomicMarket: Received action from wrong contract: ' + trace.act.account);

            return;
        }

        if (typeof trace.act.data === 'string') {
            throw new Error('AtomicMarket: Data of action could not be deserialized: ' + trace.act.name);
        }

        logger.debug('AtomicMarket Action', trace.act);

        if (trace.act.name === 'lognewauct') {
            this.core.addUpdateJob(async () => {
                await this.lognewauct(db, block, <EosioActionTrace<LogNewAuctionActionData>>trace, tx);
            }, JobPriority.ACTION_CREATE_AUCTION);
        } else if (trace.act.name === 'lognewsale') {
            this.core.addUpdateJob(async () => {
                await this.lognewsale(db, block, <EosioActionTrace<LogNewSaleActionData>>trace, tx);
            }, JobPriority.ACTION_CREATE_SALE);
        } else if (trace.act.name === 'logauctstart') {
            this.core.addUpdateJob(async () => {
                await this.logauctstart(db, block, <EosioActionTrace<LogAuctionStartActionData>>trace, tx);
            }, JobPriority.ACTION_UPDATE_AUCTION);
        } else if (trace.act.name === 'cancelauct') {
            this.core.addUpdateJob(async () => {
                await this.cancelauct(db, block, <EosioActionTrace<CancelAuctionActionData>>trace, tx);
            }, JobPriority.ACTION_UPDATE_AUCTION);
        } else if (trace.act.name === 'auctionbid') {
            this.core.addUpdateJob(async () => {
                await this.auctionbid(db, block, <EosioActionTrace<AuctionBidActionData>>trace, tx);
            }, JobPriority.ACTION_UPDATE_AUCTION);
        } else if (trace.act.name === 'auctclaimbuy') {
            this.core.addUpdateJob(async () => {
                await this.auctclaimbuy(db, block, <EosioActionTrace<AuctionClaimBuyerActionData>>trace, tx);
            }, JobPriority.ACTION_UPDATE_AUCTION);
        } else if (trace.act.name === 'auctclaimsel') {
            this.core.addUpdateJob(async () => {
                await this.auctclaimsel(db, block, <EosioActionTrace<AuctionClaimSellerActionData>>trace, tx);
            }, JobPriority.ACTION_UPDATE_AUCTION);
        } else if (trace.act.name === 'logsalestart') {
            this.core.addUpdateJob(async () => {
                await this.logsalestart(db, block, <EosioActionTrace<LogSaleStartActionData>>trace, tx);
            }, JobPriority.ACTION_UPDATE_SALE);
        } else if (trace.act.name === 'cancelsale') {
            this.core.addUpdateJob(async () => {
                await this.cancelsale(db, block, <EosioActionTrace<CancelSaleActionData>>trace, tx);
            }, JobPriority.ACTION_UPDATE_SALE);
        } else if (trace.act.name === 'purchasesale') {
            this.core.addUpdateJob(async () => {
                await this.purchasesale(db, block, <EosioActionTrace<PurchaseSaleActionData>>trace, tx);
            }, JobPriority.ACTION_UPDATE_SALE);
        }
    }

    /* AUCTIONS */
    async lognewauct(
        db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace<LogNewAuctionActionData>, tx: EosioTransaction
    ): Promise<void> {
        await db.insert('atomicmarket_auctions', {
            market_contract: this.core.args.atomicmarket_account,
            auction_id: trace.act.data.auction_id,
            seller: trace.act.data.seller,
            buyer: null,
            price: trace.act.data.starting_bid.split(' ')[0].replace('.', ''),
            token_symbol: trace.act.data.starting_bid.split(' ')[1],
            asset_contract: this.core.args.atomicassets_account,
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
            created_at_time: eosioTimestampToDate(block.timestamp).getTime(),
            created_at_txid: Buffer.from(tx.id, 'hex')
        }, ['market_contract', 'auction_id']);

        const rows = trace.act.data.asset_ids.map(row => ({
            market_contract: this.core.args.atomicmarket_account,
            auction_id: trace.act.data.auction_id,
            asset_contract: this.core.args.atomicassets_account,
            asset_id: row
        }));

        await db.insert('atomicmarket_auctions_assets', rows, [
            'market_contract', 'auction_id', 'asset_contract', 'asset_id'
        ]);
    }

    async logauctstart(
        db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace<LogAuctionStartActionData>, _: EosioTransaction
    ): Promise<void> {
        await db.update('atomicmarket_auctions', {
            state: AuctionState.LISTED.valueOf(),
            updated_at_block: block.block_num,
            updated_at_time: eosioTimestampToDate(block.timestamp).getTime()
        }, {
            str: 'market_contract = $1 AND auction_id = $2',
            values: [this.core.args.atomicmarket_account, trace.act.data.auction_id]
        }, ['market_contract', 'auction_id']);

        await this.core.events.emit('atomicmarket_auction_state_change', {
            db, block, contract: this.core.args.atomicmarket_account,
            auction_id: trace.act.data.auction_id, state: AuctionState.LISTED.valueOf()
        });
    }

    async cancelauct(
        db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace<CancelAuctionActionData>, _: EosioTransaction
    ): Promise<void> {
        await db.update('atomicmarket_auctions', {
            state: AuctionState.CANCELED.valueOf(),
            updated_at_block: block.block_num,
            updated_at_time: eosioTimestampToDate(block.timestamp).getTime()
        }, {
            str: 'market_contract = $1 AND auction_id = $2',
            values: [this.core.args.atomicmarket_account, trace.act.data.auction_id]
        }, ['market_contract', 'auction_id']);

        await this.core.events.emit('atomicmarket_auction_state_change', {
            db, block, contract: this.core.args.atomicmarket_account,
            auction_id: trace.act.data.auction_id, state: AuctionState.CANCELED.valueOf()
        });
    }

    async auctionbid(
        db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace<AuctionBidActionData>, tx: EosioTransaction
    ): Promise<void> {
        await db.update('atomicmarket_auctions', {
            buyer: trace.act.data.bidder,
            price: trace.act.data.bid.split(' ')[0].replace('.', ''),
            token_symbol: trace.act.data.bid.split(' ')[1],
            taker_marketplace: trace.act.data.taker_marketplace,
            updated_at_block: block.block_num,
            updated_at_time: eosioTimestampToDate(block.timestamp).getTime()
        }, {
            str: 'market_contract = $1 AND auction_id = $2',
            values: [this.core.args.atomicmarket_account, trace.act.data.auction_id]
        }, ['market_contract', 'auction_id']);

        const bidCount = await db.query(
            'SELECT COUNT(*) FROM atomicmarket_auctions_bids WHERE market_contract = $1 AND auction_id = $2',
            [this.core.args.atomicmarket_account, trace.act.data.auction_id]
        );

        await db.insert('atomicmarket_auctions_bids', {
            market_contract: this.core.args.atomicmarket_account,
            auction_id: trace.act.data.auction_id,
            bid_number: parseInt(bidCount.rows[0].count, 10) + 1,
            account: trace.act.data.bidder,
            amount: trace.act.data.bid.split(' ')[0].replace('.', ''),
            txid: Buffer.from(tx.id, 'hex'),
            created_at_block: block.block_num,
            created_at_time: eosioTimestampToDate(block.timestamp).getTime()
        }, ['market_contract', 'auction_id', 'bid_number']);

        await this.core.events.emit('atomicmarket_auction_bid', {
            db, block, contract: this.core.args.atomicmarket_account,
            auction_id: trace.act.data.auction_id, bid_number: parseInt(bidCount.rows[0].count, 10) + 1
        });
    }

    async auctclaimbuy(
        db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace<AuctionClaimBuyerActionData>, _: EosioTransaction
    ): Promise<void> {
        await db.update('atomicmarket_auctions', {
            claimed_by_buyer: true,
            updated_at_block: block.block_num,
            updated_at_time: eosioTimestampToDate(block.timestamp).getTime()
        }, {
            str: 'market_contract = $1 AND auction_id = $2',
            values: [this.core.args.atomicmarket_account, trace.act.data.auction_id]
        }, ['market_contract', 'auction_id']);
    }

    async auctclaimsel(
        db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace<AuctionClaimSellerActionData>, _: EosioTransaction
    ): Promise<void> {
        await db.update('atomicmarket_auctions', {
            claimed_by_seller: true,
            updated_at_block: block.block_num,
            updated_at_time: eosioTimestampToDate(block.timestamp).getTime()
        }, {
            str: 'market_contract = $1 AND auction_id = $2',
            values: [this.core.args.atomicmarket_account, trace.act.data.auction_id]
        }, ['market_contract', 'auction_id']);
    }

    /* SALES */
    async lognewsale(
        db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace<LogNewSaleActionData>, tx: EosioTransaction
    ): Promise<void> {
        await db.insert('atomicmarket_sales', {
            market_contract: this.core.args.atomicmarket_account,
            sale_id: trace.act.data.sale_id,
            seller: trace.act.data.seller,
            buyer: null,
            listing_price: trace.act.data.listing_price.split(' ')[0].replace('.', ''),
            final_price: null,
            listing_symbol: trace.act.data.listing_price.split(' ')[1],
            settlement_symbol: trace.act.data.settlement_symbol.split(',')[1],
            asset_contract: this.core.args.atomicassets_account,
            offer_id: null,
            maker_marketplace: trace.act.data.maker_marketplace,
            taker_marketplace: null,
            collection_name: trace.act.data.collection_name,
            collection_fee: trace.act.data.collection_fee,
            state: SaleState.WAITING.valueOf(),
            updated_at_block: block.block_num,
            updated_at_time: eosioTimestampToDate(block.timestamp).getTime(),
            created_at_block: block.block_num,
            created_at_time: eosioTimestampToDate(block.timestamp).getTime(),
            created_at_txid: Buffer.from(tx.id, 'hex')
        }, ['market_contract', 'sale_id']);
    }

    async logsalestart(
        db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace<LogSaleStartActionData>, _: EosioTransaction
    ): Promise<void> {
        await db.update('atomicmarket_sales', {
            state: SaleState.LISTED.valueOf(),
            offer_id: trace.act.data.offer_id,
            updated_at_block: block.block_num,
            updated_at_time: eosioTimestampToDate(block.timestamp).getTime()
        }, {
            str: 'market_contract = $1 AND sale_id = $2',
            values: [this.core.args.atomicmarket_account, trace.act.data.sale_id]
        }, ['market_contract', 'sale_id']);

        await this.core.events.emit('atomicmarket_sale_state_change', {
            db, block, contract: this.core.args.atomicmarket_account,
            sale_id: trace.act.data.sale_id, state: SaleState.LISTED.valueOf()
        });
    }

    async cancelsale(
        db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace<CancelSaleActionData>, _: EosioTransaction
    ): Promise<void> {
        await db.update('atomicmarket_sales', {
            state: SaleState.CANCELED.valueOf(),
            updated_at_block: block.block_num,
            updated_at_time: eosioTimestampToDate(block.timestamp).getTime()
        }, {
            str: 'market_contract = $1 AND sale_id = $2',
            values: [this.core.args.atomicmarket_account, trace.act.data.sale_id]
        }, ['market_contract', 'sale_id']);

        await this.core.events.emit('atomicmarket_sale_state_change', {
            db, block, contract: this.core.args.atomicmarket_account,
            sale_id: trace.act.data.sale_id, state: SaleState.CANCELED.valueOf()
        });
    }

    async purchasesale(
        db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace<PurchaseSaleActionData>, _: EosioTransaction
    ): Promise<void> {
        let finalPrice = null;

        if (parseInt(trace.act.data.intended_delphi_median, 10) === 0) {
            const sale = await db.query(
                'SELECT listing_price FROM atomicmarket_sales WHERE market_contract = $1 AND sale_id = $2',
                [this.core.args.atomicmarket_account, trace.act.data.sale_id]
            );

            if (sale.rowCount === 0) {
                throw new Error('AtomicMarket: Sale was purchased but was not found');
            }

            finalPrice = sale.rows[0].listing_price;
        } else {
            const query = await db.query(
                'SELECT pair.invert_delphi_pair, delphi.base_precision, delphi.quote_precision, delphi.median_precision, sale.listing_price ' +
                'FROM atomicmarket_symbol_pairs pair, atomicmarket_sales sale, delphioracle_pairs delphi ' +
                'WHERE sale.market_contract = pair.market_contract AND sale.listing_symbol = pair.listing_symbol AND sale.settlement_symbol = pair.settlement_symbol AND ' +
                'pair.delphi_contract = delphi.contract AND pair.delphi_pair_name = delphi.delphi_pair_name AND ' +
                'sale.market_contract = $1 AND sale.sale_id = $2',
                [this.core.args.atomicmarket_account, trace.act.data.sale_id]
            );

            if (query.rowCount === 0) {
                throw new Error('AtomicMarket: Sale was purchased but could not find delphi pair');
            }

            const row = query.rows[0];

            if (row.invert_delphi_pair) {
                finalPrice = Math.floor(parseInt(row.listing_price, 10) * parseInt(trace.act.data.intended_delphi_median, 10) *
                    Math.pow(10, row.quote_precision - row.base_precision - row.median_precision));
            } else {
                finalPrice = Math.floor((parseInt(row.listing_price, 10) / parseInt(trace.act.data.intended_delphi_median, 10)) *
                    Math.pow(10, row.median_precision + row.base_precision - row.quote_precision));
            }
        }

        await db.update('atomicmarket_sales', {
            buyer: trace.act.data.buyer,
            final_price: finalPrice,
            state: SaleState.SOLD.valueOf(),
            taker_marketplace: trace.act.data.taker_marketplace,
            updated_at_block: block.block_num,
            updated_at_time: eosioTimestampToDate(block.timestamp).getTime()
        }, {
            str: 'market_contract = $1 AND sale_id = $2',
            values: [this.core.args.atomicmarket_account, trace.act.data.sale_id]
        }, ['market_contract', 'sale_id']);

        await this.core.events.emit('atomicmarket_sale_state_change', {
            db, block, contract: this.core.args.atomicmarket_account,
            sale_id: trace.act.data.sale_id, state: SaleState.SOLD.valueOf()
        });
    }
}
