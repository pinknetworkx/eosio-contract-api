import {filterQueryArgs, RequestValues} from '../../utils';
import {NeftyMarketContext} from '../index';
import QueryBuilder from '../../../builder';

export async function getCollectionsAction(params: RequestValues, ctx: NeftyMarketContext): Promise<any> {
    const args = filterQueryArgs(params, {
        lists: {type: 'string' },
        sort: {type: 'string', values: ['collection_name', 'list'], default: 'collection_name'},
        order: {type: 'string', values: ['asc', 'desc'], default: 'asc'},
    });

    const query = new QueryBuilder(`
                SELECT collection_name, contract, list
                FROM helpers_collection_list as v
            `);

    query.equal('v.assets_contract', ctx.coreArgs.atomicassets_account);
    if (args.lists) {
        query.equalMany('v.list', args.lists.split(','));
    }
    query.append(`
                ORDER BY
                    v.${args.sort} ${args.order}
            `);

    const result = await ctx.db.query(query.buildString(), query.buildValues());
    return result.rows;
}
