import { RequestValues } from '../../utils';
import { AtomicAssetsContext } from '../index';
import { ApiError } from '../../../error';

export async function getConfigAction(params: RequestValues, ctx: AtomicAssetsContext): Promise<any> {
    const configQuery = await ctx.db.query(
        'SELECT * FROM atomicassets_config WHERE contract = $1',
        [ctx.coreArgs.atomicassets_account]
    );

    if (configQuery.rowCount === 0) {
        throw new ApiError('Config not found');
    }

    const config = configQuery.rows[0];

    const tokensQuery = await ctx.db.query(
        'SELECT token_symbol, token_contract, token_precision FROM atomicassets_tokens WHERE contract = $1',
        [config.contract]
    );

    return {
        contract: config.contract,
        version: config.version,
        collection_format: config.collection_format,
        supported_tokens: tokensQuery.rows
    };
}
