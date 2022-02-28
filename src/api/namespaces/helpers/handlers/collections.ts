import {filterQueryArgs, RequestValues} from '../../utils';
import {NeftyMarketContext} from '../index';
import QueryBuilder from '../../../builder';
import { ApiError } from '../../../error';

const updateRate = 60 * 1000;
type Cache = {
  lastUpdate: Date;
  rows: any[];
};
let cache:Cache = {
    lastUpdate: new Date(0),
    rows: null
}

export async function getCollectionsAction(params: RequestValues, ctx: NeftyMarketContext): Promise<any> {
    if (
        cache.rows === null || 
        (Date.now() > (cache.lastUpdate.getTime() + updateRate))
    ) {
        cache.lastUpdate = new Date(Date.now());
        cache.rows = await getCollectionsLists(ctx);
    }

    return cache;
}

async function getCollectionsLists(ctx: NeftyMarketContext):Promise<any[]>{
    const query = new QueryBuilder(`
        SELECT collection_name, jsonb_agg(jsonb_build_object('contract', contract, 'list_name', list)) as lists
        FROM helpers_collection_list as v
        GROUP BY collection_name
    `);

    const result = await ctx.db.query(query.buildString(), query.buildValues());
    let rows = result.rows;
    
    // If a collection is in a 'blacklist' or in 'scam' we remove all the other
    // lists it is in.
    // Also, the structure the db returns is: [{collection_name, lists:{contract, list}} ... ]
    // but we want: [{collection_name, contract, list} ... ]
    let structuredRows = [];
    for(let row of rows){
        let rowsToAdd:any[] = [];
        for(let i = 0; i < row.lists.length; i++){
            let list = row.lists[i];
            if(list.list_name === 'blacklist' || list.list_name === 'scam'){
                // From this point on, we know the collection is in at least 
                // one "evil" list, we must ignore all the non "evil" lists it is
                // in. So, we empty the rowsToAdd array and start filling it with 
                // "evil" lists only
                list = row.lists[i];
                rowsToAdd = [{
                    collection_name: row.collection_name,
                    contract: list.contract,
                    list: list.list_name
                }];
                i++;
                // We do the rest of the lists loop adding "evil" lists only
                for(;i < row.lists.length; i++){
                    list = row.lists[i];
                    if(list.list_name === 'blacklist' || list.list_name === 'scam'){
                        rowsToAdd.push({
                            collection_name: row.collection_name,
                            contract: list.contract,
                            list: list.list_name
                        });
                    }
                }
                break;
            }
            else{
                rowsToAdd.push({
                    collection_name: row.collection_name,
                    contract: list.contract,
                    list: list.list_name
                });
            }
        }
        structuredRows.push(...rowsToAdd);
    }

    return structuredRows;
}