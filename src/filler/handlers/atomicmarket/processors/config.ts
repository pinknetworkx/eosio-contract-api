import DataProcessor from '../../../processor';
import { ContractDBTransaction } from '../../../database';
import { EosioTableRow } from '../../../../types/eosio';
import { ShipBlock } from '../../../../types/ship';
import { ConfigTableRow } from '../types/tables';
import AtomicMarketHandler, { AtomicMarketUpdatePriority } from '../index';

export function configProcessor(core: AtomicMarketHandler, processor: DataProcessor): () => any {
    const destructors: Array<() => any> = [];
    const contract = core.args.atomicmarket_account;

    destructors.push(processor.onDelta(
        contract, 'config',
        async (db: ContractDBTransaction, block: ShipBlock, delta: EosioTableRow<ConfigTableRow>): Promise<void> => {
            if (!delta.present) {
                throw Error('AtomicMarket: Config should not be deleted');
            }

            if (
                core.config.version !== delta.value.version ||
                core.config.maker_market_fee !== delta.value.maker_market_fee ||
                core.config.taker_market_fee !== delta.value.taker_market_fee ||
                core.config.maximum_auction_duration !== delta.value.maximum_auction_duration ||
                core.config.minimum_bid_increase !== delta.value.minimum_bid_increase ||
                core.config.minimum_auction_duration !== delta.value.minimum_auction_duration ||
                core.config.auction_reset_duration !== delta.value.auction_reset_duration
            ) {
                await db.update('atomicmarket_config', {
                    version: delta.value.version,
                    maker_market_fee: delta.value.maker_market_fee,
                    taker_market_fee: delta.value.taker_market_fee,
                    minimum_auction_duration: delta.value.minimum_auction_duration,
                    maximum_auction_duration: delta.value.maximum_auction_duration,
                    minimum_bid_increase: delta.value.minimum_bid_increase,
                    auction_reset_duration: delta.value.auction_reset_duration
                }, {
                    str: 'market_contract = $1',
                    values: [core.args.atomicmarket_account]
                }, ['market_contract']);
            }

            if (core.config.supported_tokens.length !== delta.value.supported_tokens.length) {
                const tokens = core.config.supported_tokens.map(row => row.token_symbol.split(',')[1]);

                for (const token of delta.value.supported_tokens) {
                    const index = tokens.indexOf(token.token_symbol.split(',')[1]);

                    if (index === -1) {
                        await db.insert('atomicmarket_tokens', {
                            market_contract: core.args.atomicmarket_account,
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

            if (core.config.supported_symbol_pairs.length !== delta.value.supported_symbol_pairs.length) {
                const pairs = core.config.supported_symbol_pairs.map(
                    row => row.listing_symbol.split(',')[1] + ':' + row.settlement_symbol.split(',')[1]
                );

                for (const pair of delta.value.supported_symbol_pairs) {
                    const index = pairs.indexOf(pair.listing_symbol.split(',')[1] + ':' + pair.settlement_symbol.split(',')[1]);

                    if (index === -1) {
                        await db.insert('atomicmarket_symbol_pairs', {
                            market_contract: core.args.atomicmarket_account,
                            listing_symbol: pair.listing_symbol.split(',')[1],
                            settlement_symbol: pair.settlement_symbol.split(',')[1],
                            delphi_contract: delta.value.delphioracle_account,
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

            core.config = delta.value;
        }, AtomicMarketUpdatePriority.TABLE_CONFIG.valueOf()
    ));

    return (): any => destructors.map(fn => fn());
}
