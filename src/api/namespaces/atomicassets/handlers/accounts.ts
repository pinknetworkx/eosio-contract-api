import {oneLine} from 'common-tags';
import {IAccountCollectionStats} from 'atomicassets/build/API/Explorer/Objects';
import {buildBoundaryFilter, RequestValues} from '../../utils';
import {AtomicAssetsContext} from '../index';
import QueryBuilder from '../../../builder';
import { buildAssetFilter, buildGreylistFilter, buildHideOffersFilter } from '../utils';
import {filterQueryArgs} from '../../validation';

export {getAccountAction} from './accounts/getAccountAction';

// TODO: Separate the logic of building query to reuse it on getAccountsCountAction
/**
 * Retrieves the asset count of several account using several filters
 * like: collection_name, match(owner name), template_id
 */
export async function getAccountsAction(
    params: RequestValues,
    ctx: AtomicAssetsContext,
): Promise<any> { // TODO: Use a proper type here - can't be at the moment different return types
    const maxLimit = ctx.coreArgs.limits?.accounts || 5000;
    const args = filterQueryArgs(params, {
        page: {type: 'int', min: 1, default: 1},
        limit: {type: 'int', min: 1, max: maxLimit, default: Math.min(maxLimit, 100)},

        collection_name: {type: 'string', min: 1},
        schema_name: {type: 'string', min: 1},
        template_id: {type: 'string', min: 1},

        match: {type: 'string', min: 1},

        count: {type: 'bool'}
    });

    const query = new QueryBuilder(
        'SELECT owner account, COUNT(*) as assets FROM atomicassets_assets asset ' +
        'LEFT JOIN atomicassets_templates template ON (asset.contract = template.contract AND asset.template_id = template.template_id)'
    );

    query.equal('asset.contract', ctx.coreArgs.atomicassets_account).notNull('asset.owner');

    if (args.match_owner) {
        query.addCondition('POSITION(' + query.addVariable(args.match_owner.toLowerCase()) + ' IN asset.owner) > 0');
    }

    buildAssetFilter(params, query,  {assetTable: 'asset', templateTable: 'template', allowDataFilter: true});
    buildGreylistFilter(params, query, {collectionName: 'asset.collection_name'});

    buildHideOffersFilter(params, query, 'asset');
    buildBoundaryFilter(params, query, 'owner', 'string', null);

    query.group(['asset.owner']);

    if (args.count) {
        const countQuery = await ctx.db.query('SELECT COUNT(*) counter FROM (' + query.buildString() + ') x', query.buildValues());

        return countQuery.rows[0].counter;
    }

    query.append('ORDER BY assets DESC, account ASC');
    query.paginate(args.page, args.limit);

    const result = await ctx.db.query(query.buildString(), query.buildValues());

    return result.rows;
}

export async function getAccountsCountAction(params: RequestValues, ctx: AtomicAssetsContext): Promise<any> {
    return getAccountsAction({...params, count: 'true'}, ctx);
}

/**
 * Retrieves the template and schema count for the given account and collection name
 */
export async function getAccountCollectionAction(params: RequestValues, ctx: AtomicAssetsContext): Promise<IAccountCollectionStats> {
    const templateQuery = await ctx.db.query(oneLine`
        SELECT template_id, COUNT(*) as assets 
        FROM atomicassets_assets asset 
        WHERE contract = $1 AND owner = $2 AND collection_name = $3 
        GROUP BY template_id ORDER BY assets DESC
    `,
        [ctx.coreArgs.atomicassets_account, ctx.pathParams.account, ctx.pathParams.collection_name]
    );

    const schemaQuery = await ctx.db.query(oneLine`
        SELECT schema_name, COUNT(*) as assets
        FROM atomicassets_assets asset
        WHERE contract = $1 AND owner = $2 AND collection_name = $3
        GROUP BY schema_name ORDER BY assets DESC
    `,
        [ctx.coreArgs.atomicassets_account, ctx.pathParams.account, ctx.pathParams.collection_name]
    );

    return {
        schemas: schemaQuery.rows,
        templates: templateQuery.rows
    };
}




