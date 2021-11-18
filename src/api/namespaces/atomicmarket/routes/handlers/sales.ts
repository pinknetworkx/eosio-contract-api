import { RequestParams } from '../../../utils';
import { fillSales } from '../../filler';
import { formatSale } from '../../format';
import { ApiError } from '../../../../error';
import { AtomicMarketActionHandlerOptions } from '../../index';

export async function getSaleAction(params: RequestParams, options: AtomicMarketActionHandlerOptions): Promise<any> {
    const query = await options.db.query(
        'SELECT * FROM atomicmarket_sales_master WHERE market_contract = $1 AND sale_id = $2',
        [options.core.args.atomicmarket_account, params.sale_id]
    );

    if (query.rowCount === 0) {
        throw new ApiError('Sale not found', 416);
    }

    const sales = await fillSales(
        options.db, options.core.args.atomicassets_account, query.rows.map(formatSale)
    );

    return sales[0];
}
