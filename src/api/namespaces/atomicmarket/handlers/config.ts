import { RequestValues } from '../../utils';
import { AtomicMarketContext } from '../index';
import { ApiError } from '../../../error';

export async function getConfigAction(params: RequestValues, ctx: AtomicMarketContext): Promise<any> {
    const configQuery = await ctx.db.query(
        'SELECT * FROM atomicmarket_config WHERE market_contract = $1',
        [ctx.coreArgs.atomicmarket_account]
    );

    if (configQuery.rowCount === 0) {
        throw new ApiError('Config not found');
    }

    const config = configQuery.rows[0];

    const queryString =
        'SELECT pair.listing_symbol, pair.settlement_symbol, pair.delphi_pair_name, pair.invert_delphi_pair, to_jsonb(delphi.*) "data" ' +
        'FROM atomicmarket_symbol_pairs pair, delphioracle_pairs delphi ' +
        'WHERE pair.market_contract = $1 ' +
        'AND pair.delphi_contract = delphi.contract AND pair.delphi_pair_name = delphi.delphi_pair_name';

    const pairsQuery = await ctx.db.query(queryString, [ctx.coreArgs.atomicmarket_account]);

    const tokensQuery = await ctx.db.query(
        'SELECT token_contract, token_symbol, token_precision FROM atomicmarket_tokens WHERE market_contract = $1',
        [ctx.coreArgs.atomicmarket_account]
    );

    return {
        atomicassets_contract: ctx.coreArgs.atomicassets_account,
        atomicmarket_contract: ctx.coreArgs.atomicmarket_account,
        delphioracle_contract: ctx.coreArgs.delphioracle_account,
        version: config.version,
        maker_market_fee: config.maker_market_fee,
        taker_market_fee: config.taker_market_fee,
        minimum_auction_duration: config.minimum_auction_duration,
        maximum_auction_duration: config.maximum_auction_duration,
        minimum_bid_increase: config.minimum_bid_increase,
        auction_reset_duration: config.auction_reset_duration,
        supported_tokens: tokensQuery.rows,
        supported_pairs: pairsQuery.rows
    };
}
