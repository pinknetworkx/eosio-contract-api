import { buildBoundaryFilter, filterQueryArgs, RequestValues } from '../../utils';
import { AtomicAssetsContext } from '../index';
import QueryBuilder from '../../../builder';
import { buildGreylistFilter, buildHideOffersFilter } from '../utils';
import { formatCollection } from '../format';

export async function getAccountsAction(params: RequestValues, ctx: AtomicAssetsContext): Promise<any> {
    const args = filterQueryArgs(params, {
        page: {type: 'int', min: 1, default: 1},
        limit: {type: 'int', min: 1, max: 5000, default: 100},

        collection_name: {type: 'string', min: 1},
        schema_name: {type: 'string', min: 1},
        template_id: {type: 'string', min: 1},

        match: {type: 'string', min: 1},

        count: {type: 'bool'}
    });

    const query = new QueryBuilder('SELECT owner account, COUNT(*) as assets FROM atomicassets_assets asset');

    query.equal('contract', ctx.coreArgs.atomicassets_account).notNull('owner');

    if (args.match) {
        query.addCondition('POSITION(' + query.addVariable(args.match.toLowerCase()) + ' IN owner) > 0');
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
    buildBoundaryFilter(params, query, 'owner', 'string', null);

    query.group(['owner']);

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

export async function getAccountAction(params: RequestValues, ctx: AtomicAssetsContext): Promise<any> {
    // collection query
    const collectionQuery = new QueryBuilder(
        'SELECT collection_name, COUNT(*) as assets ' +
        'FROM atomicassets_assets asset'
    );
    collectionQuery.equal('contract', ctx.coreArgs.atomicassets_account);
    collectionQuery.equal('owner', ctx.pathParams.account);

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
    templateQuery.equal('owner', ctx.pathParams.account);

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

export async function getAccountCollectionAction(params: RequestValues, ctx: AtomicAssetsContext): Promise<any> {
    const templateQuery = await ctx.db.query(
        'SELECT template_id, COUNT(*) as assets ' +
        'FROM atomicassets_assets asset ' +
        'WHERE contract = $1 AND owner = $2 AND collection_name = $3 ' +
        'GROUP BY template_id ORDER BY assets DESC',
        [ctx.coreArgs.atomicassets_account, ctx.pathParams.account, ctx.pathParams.collection_name]
    );

    const schemaQuery = await ctx.db.query(
        'SELECT schema_name, COUNT(*) as assets ' +
        'FROM atomicassets_assets asset ' +
        'WHERE contract = $1 AND owner = $2 AND collection_name = $3 ' +
        'GROUP BY schema_name ORDER BY assets DESC',
        [ctx.coreArgs.atomicassets_account, ctx.pathParams.account, ctx.pathParams.collection_name]
    );

    return {
        schemas: schemaQuery.rows,
        templates: templateQuery.rows
    };
}
