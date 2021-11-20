import { RequestValues } from '../../../utils';
import { AtomicToolsContext } from '../../index';

export async function getConfigAction(params: RequestValues, ctx: AtomicToolsContext): Promise<any> {
    const configQuery = await ctx.db.query(
        'SELECT * FROM atomictools_config WHERE tools_contract = $1',
        [ctx.core.args.atomictools_account]
    );

    return {
        atomictools_contract: ctx.core.args.atomictools_account,
        atomicassets_contract: ctx.core.args.atomicassets_account,
        version: configQuery.rows[0].version
    };
}
