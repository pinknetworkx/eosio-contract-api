import { RequestParams } from '../../../utils';
import { fillSales } from '../../filler';
import { formatSale } from '../../format';
import { ApiError } from '../../../../error';
import { AtomicMarketContext } from '../../index';

export async function getSaleAction(params: RequestParams, context: AtomicMarketContext): Promise<any> {
    const query = await context.db.query(
        'SELECT * FROM atomicmarket_sales_master WHERE market_contract = $1 AND sale_id = $2',
        [context.core.args.atomicmarket_account, context.pathParams.sale_id]
    );

    if (query.rowCount === 0) {
        throw new ApiError('Sale not found', 416);
    }

    const sales = await fillSales(
        context.db, context.core.args.atomicassets_account, query.rows.map(formatSale)
    );

    return sales[0];
}
