import {filterQueryArgs, RequestValues} from '../../utils';
import {NeftyMarketContext} from '../index';
import QueryBuilder from '../../../builder';
import { ApiError } from '../../../error';

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
        const lists = args.lists.split(',');
        for(const list of lists){
            if(
                list !== 'whitelist' && list !== 'blacklist' &&
                list !== 'verified' && list !== 'nsfw' &&
                list !== 'scam'
            ){
                throw new ApiError(`Invalid value ${list} for parameter lists`, 400);
            }
        }
        query.equalMany('v.list', lists);
    }
    query.append(`
                ORDER BY
                    v.${args.sort} ${args.order}
            `);

    const result = await ctx.db.query(query.buildString(), query.buildValues());
    return result.rows;
}
