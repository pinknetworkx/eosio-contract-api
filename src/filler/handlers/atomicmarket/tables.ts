import AtomicMarketHandler, { AuctionState, JobPriority, SaleState } from './index';
import { ContractDBTransaction } from '../../database';
import { ShipBlock } from '../../../types/ship';
import { EosioTableRow } from '../../../types/eosio';
import logger from '../../../utils/winston';
import { AuctionsTableRow, BalancesTableRow, ConfigTableRow, MarketplacesTableRow, SalesTableRow } from './types/tables';
import { eosioTimestampToDate } from '../../../utils/eosio';

export default class AtomicMarketTableHandler {
    private readonly contractName: string;

    constructor(readonly core: AtomicMarketHandler) {
        this.contractName = this.core.args.atomicmarket_account;
    }

    async handleUpdate(db: ContractDBTransaction, block: ShipBlock, delta: EosioTableRow): Promise<void> {
        if (typeof delta.value === 'string') {
            throw new Error('AtomicMarket: Delta of atomicmarket table could not be deserialized: ' + delta.table);
        }

        if (delta.code !== this.core.args.atomicmarket_account) {
            logger.error('AtomicMarket: Received table delta from wrong contract: ' + delta.code);

            return;
        }

        logger.debug('AtomicMarket Delta', delta);

        if (delta.table === 'sales' && delta.scope === this.core.args.atomicmarket_account) {
            this.core.addUpdateJob(async () => {
                // @ts-ignore
                await this.handleSalesUpdate(db, block, delta.value, !delta.present);
            }, JobPriority.TABLE_SALES);
        } else if (delta.table === 'auctions' && delta.scope === this.core.args.atomicmarket_account) {
            this.core.addUpdateJob(async () => {
                // @ts-ignore
                await this.handleAuctionsUpdate(db, block, delta.value, !delta.present);
            }, JobPriority.TABLE_AUCTIONS);
        } else if (delta.table === 'balances' && delta.scope === this.core.args.atomicmarket_account) {
            this.core.addUpdateJob(async () => {
                // @ts-ignore
                await this.handleBalancesUpdate(db, block, delta.value, !delta.present);
            }, JobPriority.TABLE_BALANCES);
        } else if (delta.table === 'marketplaces' && delta.scope === this.core.args.atomicmarket_account) {
            this.core.addUpdateJob(async () => {
                // @ts-ignore
                await this.handleMarketplacesUpdate(db, block, delta.value, !delta.present);
            }, JobPriority.TABLE_MARKETPLACES);
        } else if (delta.table === 'config' && delta.scope === this.core.args.atomicmarket_account) {
            this.core.addUpdateJob(async () => {
                // @ts-ignore
                await this.handleConfigUpdate(db, block, delta.value, !delta.present);
            }, JobPriority.TABLE_CONFIG);
        }
    }

    async handleSalesUpdate(
        db: ContractDBTransaction, block: ShipBlock, data: SalesTableRow, deleted: boolean
    ): Promise<void> {
        if (deleted) {
            return;
        }

        await db.replace('atomicmarket_sales', {
            market_contract: this.core.args.atomicmarket_account,
            sale_id: data.sale_id,
            buyer: null,
            listing_price: data.listing_price.split(' ')[0].replace('.', ''),
            final_price: null,
            listing_symbol: data.listing_price.split(' ')[1],
            settlement_symbol: data.settlement_symbol.split(',')[1],
            asset_contract: this.core.args.atomicassets_account,
            offer_id: parseInt(data.offer_id, 10) === -1 ? null : data.offer_id,
            maker_marketplace: data.maker_marketplace,
            taker_marketplace: null,
            collection_name: data.collection_name,
            collection_fee: data.collection_fee,
            state: parseInt(data.offer_id, 10) === -1 ? SaleState.WAITING.valueOf() : SaleState.LISTED.valueOf(),
            updated_at_block: block.block_num,
            updated_at_time: eosioTimestampToDate(block.timestamp).getTime(),
            created_at_block: block.block_num,
            created_at_time: eosioTimestampToDate(block.timestamp).getTime(),
            created_at_txid: null
        }, ['market_contract', 'sale_id'], [
            'buyer', 'final_price', 'taker_marketplace', 'created_at_block', 'created_at_time', 'created_at_txid'
        ]);
    }

    async handleAuctionsUpdate(
        db: ContractDBTransaction, block: ShipBlock, data: AuctionsTableRow, deleted: boolean
    ): Promise<void> {
        if (deleted) {
            return;
        }

        await db.replace('atomicmarket_auctions', {
            market_contract: this.core.args.atomicmarket_account,
            auction_id: data.auction_id,
            seller: data.seller,
            buyer: null,
            price: data.current_bid.split(' ')[0].replace('.', ''),
            token_symbol: data.current_bid.split(' ')[1],
            asset_contract: this.core.args.atomicassets_account,
            maker_marketplace: data.maker_marketplace,
            taker_marketplace: null,
            collection_name: data.collection_name,
            collection_fee: data.collection_fee,
            claimed_by_buyer: data.claimed_by_buyer,
            claimed_by_seller: data.claimed_by_seller,
            state: data.assets_transferred ? AuctionState.LISTED.valueOf() : AuctionState.LISTED.valueOf(),
            end_time: data.end_time,
            updated_at_block: block.block_num,
            updated_at_time: eosioTimestampToDate(block.timestamp).getTime(),
            created_at_block: block.block_num,
            created_at_time: eosioTimestampToDate(block.timestamp).getTime(),
            created_at_txid: null
        }, ['market_contract', 'auction_id'], [
            'buyer', 'taker_marketplace', 'created_at_block', 'created_at_time', 'created_at_txid'
        ]);

        const assets = await db.query(
            'SELECT COUNT(*) FROM atomicmarket_auctions_assets WHERE market_contract = $1 AND auction_id = $2',
            [this.core.args.atomicmarket_account, data.auction_id]
        );

        if (assets.rows[0].count === 0) {
            const rows = data.asset_ids.map(row => ({
                market_contract: this.core.args.atomicmarket_account,
                auction_id: data.auction_id,
                asset_contract: this.core.args.atomicassets_account,
                asset_id: row
            }));

            await db.insert('atomicmarket_auctions_assets', rows, [
                'market_contract', 'auction_id', 'asset_contract', 'asset_id'
            ]);
        }
    }

    async handleBalancesUpdate(
        db: ContractDBTransaction, block: ShipBlock, data: BalancesTableRow, deleted: boolean
    ): Promise<void> {
        await db.delete('atomicmarket_balances', {
            str: 'market_contract = $1 AND owner = $2',
            values: [this.contractName, data.owner]
        });

        if (deleted) {
            return;
        }

        await db.insert('atomicmarket_balances', data.quantities.map(quantity => ({
            market_contract: this.contractName,
            owner: data.owner,
            token_symbol: quantity.split(' ')[1],
            amount: quantity.split(' ')[0].replace('.', ''),
            updated_at_block: block.block_num,
            updated_at_time: eosioTimestampToDate(block.timestamp).getTime()
        })), ['market_contract', 'owner', 'token_symbol']);
    }

    async handleConfigUpdate(
        db: ContractDBTransaction, _: ShipBlock, data: ConfigTableRow, deleted: boolean
    ): Promise<void> {
        if (deleted) {
            throw Error('AtomicMarket: Config should not be deleted');
        }

        if (
            this.core.config.version !== data.version ||
            this.core.config.maker_market_fee !== data.maker_market_fee ||
            this.core.config.taker_market_fee !== data.taker_market_fee ||
            this.core.config.maximum_auction_duration !== data.maximum_auction_duration ||
            this.core.config.minimum_bid_increase !== data.minimum_bid_increase ||
            this.core.config.minimum_auction_duration !== data.minimum_auction_duration ||
            this.core.config.auction_reset_duration !== data.auction_reset_duration
        ) {
            await db.update('atomicmarket_config', {
                version: data.version,
                maker_market_fee: data.maker_market_fee,
                taker_market_fee: data.taker_market_fee,
                minimum_auction_duration: data.minimum_auction_duration,
                maximum_auction_duration: data.maximum_auction_duration,
                minimum_bid_increase: data.minimum_bid_increase,
                auction_reset_duration: data.auction_reset_duration
            }, {
                str: 'market_contract = $1',
                values: [this.core.args.atomicmarket_account]
            }, ['market_contract']);
        }

        if (this.core.config.supported_tokens.length !== data.supported_tokens.length) {
            const tokens = this.core.config.supported_tokens.map(row => row.token_symbol.split(',')[1]);

            for (const token of data.supported_tokens) {
                const index = tokens.indexOf(token.token_symbol.split(',')[1]);

                if (index === -1) {
                    await db.insert('atomicmarket_tokens', {
                        market_contract: this.core.args.atomicmarket_account,
                        token_contract: token.token_contract,
                        token_symbol: token.token_symbol.split(',')[1],
                        token_precision: token.token_symbol.split(',')[0]
                    }, ['market_contract', 'token_symbol']);
                } else {
                    tokens.splice(index, 1);
                }
            }

            if (tokens.length > 0) {
                throw new Error('AtomicMarket: Supported token removed. Should not be possible');
            }
        }

        if (this.core.config.supported_symbol_pairs.length !== data.supported_symbol_pairs.length) {
            const pairs = this.core.config.supported_symbol_pairs.map(
                row => row.listing_symbol.split(',')[1] + ':' + row.settlement_symbol.split(',')[1]
            );

            for (const pair of data.supported_symbol_pairs) {
                const index = pairs.indexOf(pair.listing_symbol.split(',')[1] + ':' + pair.settlement_symbol.split(',')[1]);

                if (index === -1) {
                    await db.insert('atomicmarket_symbol_pairs', {
                        market_contract: this.core.args.atomicmarket_account,
                        listing_symbol: pair.listing_symbol.split(',')[1],
                        settlement_symbol: pair.settlement_symbol.split(',')[1],
                        delphi_contract: data.delphioracle_account,
                        delphi_pair_name: pair.delphi_pair_name,
                        invert_delphi_pair: pair.invert_delphi_pair
                    }, ['market_contract', 'listing_symbol', 'settlement_symbol']);
                } else {
                    pairs.splice(index, 1);
                }
            }

            if (pairs.length > 0) {
                throw new Error('AtomicMarket: Symbol pair removed. Should not be possible');
            }
        }

        this.core.config = data;
    }

    async handleMarketplacesUpdate(
        db: ContractDBTransaction, block: ShipBlock, data: MarketplacesTableRow, deleted: boolean
    ): Promise<void> {
        if (deleted) {
            throw new Error('AtomicMarket: Marketplace deleted. Should not be possible');
        }

        await db.replace('atomicmarket_marketplaces', {
            market_contract: this.core.args.atomicmarket_account,
            marketplace_name: data.marketplace_name,
            creator: data.creator,
            created_at_block: block.block_num,
            created_at_time: eosioTimestampToDate(block.timestamp).getTime()
        }, ['market_contract', 'marketplace_name'], [
            'created_at_block', 'created_at_time'
        ]);
    }
}
