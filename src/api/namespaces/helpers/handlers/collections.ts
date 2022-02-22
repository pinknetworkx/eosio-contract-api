import {filterQueryArgs, RequestValues} from '../../utils';
import {NeftyMarketContext} from '../index';
import QueryBuilder from '../../../builder';
import { ApiError } from '../../../error';

export async function getCollectionsAction(params: RequestValues, ctx: NeftyMarketContext): Promise<any> {

    const query = new QueryBuilder(`
        SELECT collection_name, jsonb_agg(jsonb_build_object('contract', contract, 'list_name', list)) as lists
        FROM helpers_collection_list as v
        GROUP BY collection_name
    `);

    const result = await ctx.db.query(query.buildString(), query.buildValues());
    let rows = result.rows;
    // If a collection is in a 'blacklist' or in 'scam' we remove all the other
    // lists it is in
    for(let row of rows){
        let newLists = [];
        for(let list of row.lists){
            if(list.list_name === 'blacklist' || list.list_name === 'scam'){
                newLists.push(list);
            }
        }
        // it means it had at leas one blacklist or scam
        if(newLists.length > 0){
            row.lists = newLists;
        }
    }

    return rows;
}
