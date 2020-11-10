import { ContractDBTransaction } from '../../database';
import { ShipBlock } from '../../../types/ship';
import AtomicHubHandler from './index';
import logger from '../../../utils/winston';
import { SaleState } from '../atomicmarket';

export default class AtomicMarketActionHandler {
    private readonly contractName: string;

    constructor(readonly core: AtomicHubHandler) {
        this.contractName = this.core.args.atomicmarket_account;

        this.core.events.on('atomicmarket_sale_state_change', async ({db, block, contract, sale_id, state}: {
            db: ContractDBTransaction, block: ShipBlock, contract: string, sale_id: string, state: number
        }) => {
            if (this.contractName !== contract) {
                return;
            }

            await this.handleSaleStateChange(db, block, sale_id, state);
        });

        this.core.events.on('atomicmarket_auction_bid', async ({db, block, contract, auction_id, bid_number}: {
            db: ContractDBTransaction, block: ShipBlock, contract: string, auction_id: string, bid_number: number
        }) => {
            if (this.contractName !== contract) {
                return;
            }

            await this.handleAuctionBid(db, block, auction_id, bid_number);
        });

        this.core.events.on('atomicmarket_auction_state_change', async ({db, block, contract, auction_id, state}: {
            db: ContractDBTransaction, block: ShipBlock, contract: string, auction_id: string, state: number
        }) => {
            if (this.contractName !== contract) {
                return;
            }

            await this.handleAuctionStateChange(db, block, auction_id, state);
        });
    }

    async handleAuctionStateChange(db: ContractDBTransaction, _block: ShipBlock, auctionID: string, _state: number): Promise<void> {
        const auction = await this.getAuction(db, auctionID);

        if (auction === null) {
            logger.error('AtomicHub: Auction state changed but auction not found in database');

            return;
        }

        /*if (state === AuctionState.FINISHED.valueOf()) {
            await this.core.createNotification(
                db, block, this.contractName, auction.seller,
                'Your auction #' + auctionID + ' has ended',
                {type: 'auction', id: auctionID}
            );
        }*/
    }

    async handleAuctionBid(
        db: ContractDBTransaction, block: ShipBlock, auctionID: string, bidNumber: number
    ): Promise<void> {
        const lowerBidQuery = await this.core.connection.database.query(
            'SELECT account FROM atomicmarket_auctions_bids WHERE market_contract = $1 AND auction_id = $2 AND bid_number < $3 ORDER BY bid_number DESC LIMIT 1',
            [this.contractName, auctionID, bidNumber]
        );

        if (lowerBidQuery.rows.length > 0) {
            await this.core.createNotification(
                db, block, this.contractName, lowerBidQuery.rows[0].account,
                'You were outbid on auction #' + auctionID + '',
                {type: 'auction', id: auctionID}
            );
        }

        const bidQuery = await db.query(
            'SELECT bid.account, auction.seller FROM atomicmarket_auctions auction, atomicmarket_auctions_bids bid ' +
            'WHERE bid.market_contract = auction.market_contract AND bid.auction_id = auction.auction_id AND ' +
            'bid.market_contract = $1 AND bid.auction_id = $2 AND bid.bid_number = $3',
            [this.core.args.atomicmarket_account, auctionID, bidNumber]
        );

        if (bidQuery.rowCount === 0) {
            throw new Error('AtomicHub: Bid not found');
        }

        await this.core.createNotification(
            db, block, this.contractName, bidQuery.rows[0].seller,
            bidQuery.rows[0].account + ' has made a bid on your auction #' + auctionID + '',
            {type: 'auction', id: auctionID}
        );
    }

    async handleSaleStateChange(db: ContractDBTransaction, block: ShipBlock, saleID: string, state: number): Promise<void> {
        const auction = await this.getSale(db, saleID);

        if (auction === null) {
            logger.error('AtomicHub: Sale state changed but sale not found in database');

            return;
        }

        if (state === SaleState.SOLD.valueOf()) {
            await this.core.createNotification(
                db, block, this.contractName, auction.seller,
                'Your sale #' + saleID + ' was bought.',
                {type: 'sale', id: saleID}
            );
        }
    }

    private async getSale(db: ContractDBTransaction, saleID: string): Promise<any> {
        const query = await db.query(
            'SELECT sale_id, seller, buyer FROM atomicmarket_sales WHERE market_contract = $1 AND sale_id = $2',
            [this.contractName, saleID]
        );

        if (query.rowCount > 0) {
            return query.rows[0];
        }

        return null;
    }

    private async getAuction(db: ContractDBTransaction, auctionID: string): Promise<any> {
        const query = await db.query(
            'SELECT auction_id, seller, buyer FROM atomicmarket_auctions WHERE market_contract = $1 AND auction_id = $2',
            [this.contractName, auctionID]
        );

        if (query.rowCount > 0) {
            return query.rows[0];
        }

        return null;
    }
}
