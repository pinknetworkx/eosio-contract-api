import {filterQueryArgs, RequestValues} from '../../utils';
import {NeftyMarketContext} from '../index';
import QueryBuilder from '../../../builder';

export async function getCollectionsAction(params: RequestValues, ctx: NeftyMarketContext): Promise<any> {
    const args = filterQueryArgs(params, {
        page: {type: 'int', min: 1, default: 1},
        limit: {type: 'int', min: 1, max: 1000, default: 1000},
    });


    const query = new QueryBuilder(`
                SELECT collection_name, contract, list
                FROM helpers_collection_list as v
            `);
    query.equal('v.assets_contract', ctx.coreArgs.atomicassets_account);
    query.append(`
                LIMIT ${query.addVariable(args.limit)}
                OFFSET ${query.addVariable((args.page - 1) * args.limit)}
            `);

    const result = await ctx.db.query(query.buildString(), query.buildValues());
    return result.rows;
}
