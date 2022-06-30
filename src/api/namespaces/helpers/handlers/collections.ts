import {filterQueryArgs, RequestValues} from '../../utils';
import {NeftyMarketContext} from '../index';
import QueryBuilder from '../../../builder';

export async function getCollectionsAction(params: RequestValues, ctx: NeftyMarketContext): Promise<any> {
    const args = filterQueryArgs(params, {
        list: {type: 'string', values: ['whitelist', 'blacklist', 'verified', 'nsfw', 'scam']},
        sort: {type: 'string', values: ['collection_name', 'list'], default: 'collection_name'},
        order: {type: 'string', values: ['asc', 'desc'], default: 'asc'},
    });


    const query = new QueryBuilder(`
                SELECT collection_name, contract, list
                FROM helpers_collection_list as v
            `);
    query.equal('v.assets_contract', ctx.coreArgs.atomicassets_account);
    if (args.list === 'blacklist') {
        query.equal('v.list', args.list);
        query.unequal('v.list', 'exceptions');
    } else if (args.list) {
        query.equal('v.list', args.list);
    }
    query.append(`
                ORDER BY
                    v.${args.sort} ${args.order}
            `);

    const result = await ctx.db.query(query.buildString(), query.buildValues());
    return result.rows;
}
