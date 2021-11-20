import { buildBoundaryFilter, filterQueryArgs, RequestValues } from '../../../utils';
import { AtomicAssetsContext } from '../../index';
import QueryBuilder from '../../../../builder';
import { buildGreylistFilter } from '../../utils';
import { formatCollection } from '../../format';
import { ApiError } from '../../../../error';
import { applyActionGreylistFilters, getContractActionLogs } from '../../../../utils';

export async function getCollectionsAction(params: RequestValues, ctx: AtomicAssetsContext): Promise<any> {
    const args = filterQueryArgs(params, {
        page: {type: 'int', min: 1, default: 1},
        limit: {type: 'int', min: 1, max: 100, default: 100},
        sort: {type: 'string', values: ['created', 'collection_name'], default: 'created'},
        order: {type: 'string', values: ['asc', 'desc'], default: 'desc'},

        author: {type: 'string', min: 1, max: 12},
        authorized_account: {type: 'string', min: 1, max: 12},
        notify_account: {type: 'string', min: 1, max: 12},

        match: {type: 'string', min: 1},

        count: {type: 'bool'}
    });

    const query = new QueryBuilder('SELECT * FROM atomicassets_collections_master');

    if (args.author) {
        query.equalMany('author', args.author.split(','));
    }

    if (args.authorized_account) {
        query.addCondition(query.addVariable(args.authorized_account) + ' = ANY(authorized_accounts)');
    }

    if (args.notify_account) {
        query.addCondition(query.addVariable(args.notify_account) + ' = ANY(notify_accounts)');
    }

    if (args.match) {
        query.addCondition('POSITION(' + query.addVariable(args.match.toLowerCase()) + ' IN collection_name) > 0');
    }

    buildBoundaryFilter(params, query, 'collection_name', 'string', 'created_at_time');
    buildGreylistFilter(params, query, {collectionName: 'collection_name'});

    if (args.count) {
        const countQuery = await ctx.db.query(
            'SELECT COUNT(*) counter FROM (' + query.buildString() + ') x',
            query.buildValues()
        );

        return countQuery.rows[0].counter;
    }

    const sortColumnMapping: {[key: string]: string} = {
        created: 'created_at_time',
        collection_name: 'collection_name'
    };

    query.append('ORDER BY ' + sortColumnMapping[args.sort] + ' ' + args.order + ', collection_name ASC');
    query.paginate(args.page, args.limit);

    const result = await ctx.db.query(query.buildString(), query.buildValues());

    return result.rows.map((row) => formatCollection(row));
}

export async function getCollectionsCountAction(params: RequestValues, ctx: AtomicAssetsContext): Promise<any> {
    return await getCollectionsAction({...params, count: 'true'}, ctx);
}

export async function getCollectionAction(params: RequestValues, ctx: AtomicAssetsContext): Promise<any> {
    const query = await ctx.db.query(
        'SELECT * FROM atomicassets_collections_master WHERE contract = $1 AND collection_name = $2',
        [ctx.core.args.atomicassets_account, ctx.pathParams.collection_name]
    );

    if (query.rowCount === 0) {
        throw new ApiError('Collection not found', 416);
    }

    return formatCollection(query.rows[0]);
}

export async function getCollectionStatsAction(params: RequestValues, ctx: AtomicAssetsContext): Promise<any> {
    const query = await ctx.db.query(
        'SELECT ' +
        '(SELECT COUNT(*) FROM atomicassets_assets WHERE contract = $1 AND collection_name = $2) assets, ' +
        '(SELECT COUNT(*) FROM atomicassets_assets WHERE contract = $1 AND collection_name = $2 AND owner IS NULL) burned, ' +
        'ARRAY(' +
        'SELECT json_build_object(\'template_id\', template_id, \'burned\', COUNT(*)) ' +
        'FROM atomicassets_assets ' +
        'WHERE contract = $1 AND collection_name = $2 AND owner IS NULL GROUP BY template_id' +
        ') burned_by_template, ' +
        'ARRAY(' +
        'SELECT json_build_object(\'schema_name\', schema_name, \'burned\', COUNT(*)) ' +
        'FROM atomicassets_assets ' +
        'WHERE contract = $1 AND collection_name = $2 AND owner IS NULL GROUP BY schema_name' +
        ') burned_by_schema, ' +
        '(SELECT COUNT(*) FROM atomicassets_templates WHERE contract = $1 AND collection_name = $2) templates, ' +
        '(SELECT COUNT(*) FROM atomicassets_schemas WHERE contract = $1 AND collection_name = $2) "schemas"',
        [ctx.core.args.atomicassets_account, ctx.pathParams.collection_name]
    );

    return query.rows[0];
}

export async function getCollectionSchemasAction(params: RequestValues, ctx: AtomicAssetsContext): Promise<any> {
    const query = await ctx.db.query(
        `SELECT schema_name FROM atomicassets_schemas "schema"
                WHERE contract = $1 AND collection_name = $2 AND EXISTS (
                    SELECT * FROM atomicassets_assets asset 
                    WHERE asset.contract = "schema".contract AND asset.collection_name = "schema".collection_name AND 
                        asset.schema_name = "schema".schema_name AND "owner" IS NOT NULL
                )`,
        [ctx.core.args.atomicassets_account, ctx.pathParams.collection_name]
    );

    return query.rows;
}

export async function getCollectionLogsAction(params: RequestValues, ctx: AtomicAssetsContext): Promise<any> {
    const args = filterQueryArgs(params, {
        page: {type: 'int', min: 1, default: 1},
        limit: {type: 'int', min: 1, max: 100, default: 100},
        order: {type: 'string', values: ['asc', 'desc'], default: 'asc'}
    });

    return await getContractActionLogs(
        ctx.db, ctx.core.args.atomicassets_account,
        applyActionGreylistFilters(['createcol', 'addcolauth', 'forbidnotify', 'remcolauth', 'remnotifyacc', 'setmarketfee', 'setcoldata'], args),
        {collection_name: ctx.pathParams.collection_name},
        (args.page - 1) * args.limit, args.limit, args.order
    );
}