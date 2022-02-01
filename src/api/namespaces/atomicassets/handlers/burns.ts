import { buildBoundaryFilter, RequestValues } from '../../utils';
import { AtomicAssetsContext } from '../index';
import QueryBuilder from '../../../builder';
import { buildGreylistFilter, buildHideOffersFilter } from '../utils';
import { formatCollection } from '../format';
import { filterQueryArgs } from '../../validation';

export async function getBurnsAction(params: RequestValues, ctx: AtomicAssetsContext): Promise<any> {
    const maxLimit = ctx.coreArgs.limits?.burns || 5000;
    const args = filterQueryArgs(params, {
        page: {type: 'int', min: 1, default: 1},
        limit: {type: 'int', min: 1, max: maxLimit, default: Math.min(maxLimit, 100)},

        collection_name: {type: 'string', min: 1},
        schema_name: {type: 'string', min: 1},
        template_id: {type: 'string', min: 1},

        match: {type: 'string', min: 1}
    });

    const query = new QueryBuilder('SELECT burned_by_account account, COUNT(*) as assets FROM atomicassets_assets asset');

    query.equal('contract', ctx.coreArgs.atomicassets_account).notNull('burned_by_account');

    if (args.match) {
        query.addCondition('POSITION(' + query.addVariable(args.match.toLowerCase()) + ' IN burned_by_account) > 0');
    }

    buildGreylistFilter(params, query, {collectionName: 'asset.collection_name'});

    if (args.collection_name) {
        query.equalMany('asset.collection_name', args.collection_name.split(','));
    }

    if (args.schema_name) {
        query.equalMany('asset.schema_name', args.schema_name.split(','));
    }

    if (args.template_id) {
        query.equalMany('asset.template_id', args.template_id.split(','));
    }

    buildHideOffersFilter(params, query, 'asset');
    buildBoundaryFilter(params, query, 'burned_by_account', 'string', null);

    query.group(['burned_by_account']);

    query.append('ORDER BY assets DESC, account ASC');
    query.paginate(args.page, args.limit);

    const result = await ctx.db.query(query.buildString(), query.buildValues());

    return result.rows;
}

export async function getBurnsAccountAction(params: RequestValues, ctx: AtomicAssetsContext): Promise<any> {
    // collection query
    const collectionQuery = new QueryBuilder(
        'SELECT collection_name, COUNT(*) as assets ' +
        'FROM atomicassets_assets asset'
    );
    collectionQuery.equal('contract', ctx.coreArgs.atomicassets_account);
    collectionQuery.equal('burned_by_account', ctx.pathParams.account);

    buildGreylistFilter(params, collectionQuery, {collectionName: 'asset.collection_name'});
    buildHideOffersFilter(params, collectionQuery, 'asset');

    collectionQuery.group(['contract', 'collection_name']);
    collectionQuery.append('ORDER BY assets DESC');

    const collectionResult = await ctx.db.query(collectionQuery.buildString(), collectionQuery.buildValues());

    // template query
    const templateQuery = new QueryBuilder(
        'SELECT collection_name, template_id, COUNT(*) as assets ' +
        'FROM atomicassets_assets asset'
    );
    templateQuery.equal('contract', ctx.coreArgs.atomicassets_account);
    templateQuery.equal('burned_by_account', ctx.pathParams.account);

    buildGreylistFilter(params, templateQuery, {collectionName: 'asset.collection_name'});
    buildHideOffersFilter(params, templateQuery, 'asset');

    templateQuery.group(['contract', 'collection_name', 'template_id']);
    templateQuery.append('ORDER BY assets DESC');

    const templateResult = await ctx.db.query(templateQuery.buildString(), templateQuery.buildValues());

    const collections = await ctx.db.query(
        'SELECT * FROM atomicassets_collections_master WHERE contract = $1 AND collection_name = ANY ($2)',
        [ctx.coreArgs.atomicassets_account, collectionResult.rows.map(row => row.collection_name)]
    );

    const lookupCollections = collections.rows.reduce(
        (prev, current) => Object.assign(prev, {[current.collection_name]: formatCollection(current)}), {}
    );

    return {
        collections: collectionResult.rows.map(row => ({
            collection: lookupCollections[row.collection_name],
            assets: row.assets
        })),
        templates: templateResult.rows,
        assets: collectionResult.rows.reduce((prev, current) => prev + parseInt(current.assets, 10), 0)
    };
}
