import { RequestValues } from '../../utils';
import { AtomicMarketContext } from '../index';
import { ApiError } from '../../../error';

export async function getMarketplacesAction(params: RequestValues, ctx: AtomicMarketContext): Promise<any> {
    const query = await ctx.db.query(
        'SELECT marketplace_name, creator, created_at_block, created_at_time FROM atomicmarket_marketplaces WHERE market_contract = $1',
        [ctx.coreArgs.atomicmarket_account]
    );

    return query.rows;
}

export async function getMarketplaceAction(params: RequestValues, ctx: AtomicMarketContext): Promise<any> {
    const query = await ctx.db.query(
        'SELECT marketplace_name, creator, created_at_block, created_at_time FROM atomicmarket_marketplaces WHERE market_contract = $1 AND marketplace_name = $2',
        [ctx.coreArgs.atomicmarket_account, ctx.pathParams.name]
    );

    if (query.rowCount === 0) {
        throw new ApiError('Marketplace not found', 416);
    }

    return query.rows[0];
}
