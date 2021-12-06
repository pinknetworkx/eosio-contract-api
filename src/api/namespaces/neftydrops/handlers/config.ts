import { RequestValues } from '../../utils';
import { NeftyDropsContext } from '../index';
import { ApiError } from '../../../error';

export async function getConfigAction(params: RequestValues, ctx: NeftyDropsContext): Promise<any> {
    const configQuery = await ctx.db.query(
        'SELECT * FROM neftydrops_config WHERE drops_contract = $1',
        [ctx.coreArgs.neftydrops_account]
    );

    if (configQuery.rowCount === 0) {
        throw new ApiError('Config not found');
    }

    const config = configQuery.rows[0];

    const queryString =
        'SELECT pair.listing_symbol, pair.settlement_symbol, pair.delphi_pair_name, pair.invert_delphi_pair, row_to_json(delphi.*) "data" ' +
        'FROM neftydrops_symbol_pairs pair, delphioracle_pairs delphi ' +
        'WHERE pair.drops_contract = $1 ' +
        'AND pair.delphi_contract = delphi.contract AND pair.delphi_pair_name = delphi.delphi_pair_name';

    const pairsQuery = await ctx.db.query(queryString, [ctx.coreArgs.neftydrops_account]);

    const tokensQuery = await ctx.db.query(
        'SELECT token_contract, token_symbol, token_precision FROM neftydrops_tokens WHERE drops_contract = $1',
        [ctx.coreArgs.neftydrops_account]
    );

    return {
        neftydrops_contract: ctx.coreArgs.neftydrops_account,
        atomicassets_contract: config.atomicassets_contract,
        delphioracle_contract: config.delphioracle_account,
        version: config.version,
        drop_fee: config.drop_fee,
        supported_tokens: tokensQuery.rows,
        supported_pairs: pairsQuery.rows
    };
}
