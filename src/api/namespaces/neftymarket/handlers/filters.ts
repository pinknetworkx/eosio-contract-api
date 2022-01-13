import {RequestValues} from '../../utils';
import {NeftyMarketContext} from '../index';
import {ApiError} from '../../../error';
import QueryBuilder from '../../../builder';
import { filterQueryArgs } from '../../validation';

export async function getAttributeFiltersAction(params: RequestValues, ctx: NeftyMarketContext): Promise<any> {
    const args = filterQueryArgs(params, {
        page: {type: 'int', min: 1, default: 1},
        limit: {type: 'int', min: 1, max: 10000, default: 1000},
        sort: {type: 'string', allowedValues: ['key', 'value'], default: 'key'},
        order: {type: 'string', allowedValues: ['asc', 'desc'], default: 'desc'},

        schema_name: {type: 'string', default: ''},
        attribute_names: {type: 'string', default: ''}
    });

    if(!args.attribute_names || args.attribute_names.trim() === ''){
        throw new ApiError('Error in query param: \'attribute_names\'', 400);
    }

    // We dont want the attribute_names to be case sensitive
    const lowerCaseAttributeNames = args.attribute_names.split(',').map(
        (attrName:string):string => attrName.toLowerCase()
    );

    const query = new QueryBuilder(`
                SELECT v.key, v.value
                FROM neftydrops_attribute_filters as v
            `);
    query.equal('v.contract', ctx.coreArgs.atomicassets_account);
    query.equal('v.collection_name', ctx.pathParams.collection_name);
    if (args.schema_name && args.schema_name.trim() !== '') {
        query.equal('v.schema_name', args.schema_name);
    }
    query.equalMany('LOWER(v.key)', lowerCaseAttributeNames);

    query.append(`
                ORDER BY
                    v.${args.sort} ${args.order}
                LIMIT ${query.addVariable(args.limit)}
                OFFSET ${query.addVariable((args.page - 1) * args.limit)}
            `);

    const result = await ctx.db.query(query.buildString(), query.buildValues());
    return result.rows;
}
