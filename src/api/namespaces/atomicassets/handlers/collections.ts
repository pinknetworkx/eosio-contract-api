import { buildBoundaryFilter, RequestValues } from '../../utils';
import { AtomicAssetsContext } from '../index';
import QueryBuilder from '../../../builder';
import { buildGreylistFilter } from '../utils';
import { formatCollection } from '../format';
import { ApiError } from '../../../error';
import { applyActionGreylistFilters, getContractActionLogs } from '../../../utils';
import { filterQueryArgs } from '../../validation';

export async function getCollectionsAction(params: RequestValues, ctx: AtomicAssetsContext): Promise<any> {
    const maxLimit = ctx.coreArgs.limits?.collections || 1000;
    const args = await filterQueryArgs(params, {
        page: {type: 'int', min: 1, default: 1},
        limit: {type: 'int', min: 1, max: maxLimit, default: Math.min(maxLimit, 100)},
        sort: {type: 'string', allowedValues: ['created', 'collection_name'], default: 'created'},
        order: {type: 'string', allowedValues: ['asc', 'desc'], default: 'desc'},

        author: {type: 'string[]', min: 1, max: 12},
        authorized_account: {type: 'string', min: 1, max: 12},
        notify_account: {type: 'string', min: 1, max: 12},

        match: {type: 'string', min: 1},
        search: {type: 'string', min: 1},

        count: {type: 'bool'}
    });

    const query = new QueryBuilder('SELECT collection_name FROM atomicassets_collections collection');

    query.equal('contract', ctx.coreArgs.atomicassets_account);

    if (args.author.length) {
        query.equalMany('author', args.author);
    }

    if (args.authorized_account) {
        query.addCondition(query.addVariable(args.authorized_account) + ' = ANY(collection.authorized_accounts)');
    }

    if (args.notify_account) {
        query.addCondition(query.addVariable(args.notify_account) + ' = ANY(collection.notify_accounts)');
    }

    if (args.match) {
        query.addCondition('POSITION(' + query.addVariable(args.match.toLowerCase()) + ' IN collection.collection_name) > 0');
    }

    if (args.search) {
        query.addCondition(`${query.addVariable(args.search)} <% (collection.collection_name || ' ' || COALESCE(collection.data->>'name', ''))`);
    }

    await buildBoundaryFilter(params, query, 'collection.collection_name', 'string', 'collection.created_at_time');
    await buildGreylistFilter(params, query, {collectionName: 'collection.collection_name'});

    if (args.count) {
        const countQuery = await ctx.db.query(
            'SELECT COUNT(*) counter FROM (' + query.buildString() + ') x',
            query.buildValues()
        );

        return countQuery.rows[0].counter;
    }

    const sortColumnMapping: { [key: string]: string } = {
        created: 'created_at_time',
        collection_name: 'collection_name'
    };

    query.append('ORDER BY ' + sortColumnMapping[args.sort] + ' ' + args.order + ', collection_name ASC');
    query.paginate(args.page, args.limit);

    const collectionResult = await ctx.db.query(query.buildString(), query.buildValues());

    const result = await ctx.db.query(
        'SELECT * FROM atomicassets_collections_master WHERE contract = $1 AND collection_name = ANY($2)',
        [ctx.coreArgs.atomicassets_account, collectionResult.rows.map(row => row.collection_name)]
    );

    const collectionLookup: {[key: string]: any} = result.rows.reduce((prev, current) => {
        prev[String(current.collection_name)] = current;

        return prev;
    }, {});

    return collectionResult.rows.map(row => formatCollection(collectionLookup[row.collection_name]));
}

export async function getCollectionsCountAction(params: RequestValues, ctx: AtomicAssetsContext): Promise<any> {
    return await getCollectionsAction({...params, count: 'true'}, ctx);
}

export async function getCollectionAction(params: RequestValues, ctx: AtomicAssetsContext): Promise<any> {
    const query = await ctx.db.query(
        'SELECT * FROM atomicassets_collections_master WHERE contract = $1 AND collection_name = $2',
        [ctx.coreArgs.atomicassets_account, ctx.pathParams.collection_name]
    );

    if (query.rowCount === 0) {
        throw new ApiError('Collection not found', 416);
    }

    return formatCollection(query.rows[0]);
}

export async function getCollectionStatsAction(params: RequestValues, ctx: AtomicAssetsContext): Promise<any> {
    const query = await ctx.db.query(`
        WITH assets AS (
            SELECT
                template_id,
                schema_name,
                SUM(assets) assets,
                SUM(burned) burned
            FROM atomicassets_asset_counts
            WHERE contract = $1
                AND collection_name = $2
            GROUP BY template_id, schema_name
        )
        
        SELECT
            (SELECT SUM(assets) FROM assets) assets,
            (SELECT SUM(burned) FROM assets) burned,
            ARRAY(SELECT jsonb_build_object('template_id', template_id, 'burned', SUM(burned)) FROM assets GROUP BY template_id HAVING SUM(burned) > 0) burned_by_template,
            ARRAY(SELECT jsonb_build_object('schema_name', schema_name, 'burned', SUM(burned)) FROM assets GROUP BY schema_name HAVING SUM(burned) > 0) burned_by_schema,
            (SELECT COUNT(*) FROM atomicassets_templates WHERE contract = $1 AND collection_name = $2) templates,
            (SELECT COUNT(*) FROM atomicassets_schemas WHERE contract = $1 AND collection_name = $2) "schemas"
        `, [ctx.coreArgs.atomicassets_account, ctx.pathParams.collection_name]
    );

    return query.rows[0];
}

export async function getCollectionSchemasAction(params: RequestValues, ctx: AtomicAssetsContext): Promise<any> {
    const query = await ctx.db.query(
        `
        SELECT schema_name FROM atomicassets_asset_counts
        WHERE contract = $1 AND collection_name = $2
        GROUP BY schema_name
        HAVING SUM(owned) > 0
        `,
        [ctx.coreArgs.atomicassets_account, ctx.pathParams.collection_name]
    );

    return query.rows;
}

export async function getCollectionLogsAction(params: RequestValues, ctx: AtomicAssetsContext): Promise<any> {
    const maxLimit = ctx.coreArgs.limits?.logs || 100;
    const args = await filterQueryArgs(params, {
        page: {type: 'int', min: 1, default: 1},
        limit: {type: 'int', min: 1, max: maxLimit, default: Math.min(maxLimit, 100)},
        order: {type: 'string', allowedValues: ['asc', 'desc'], default: 'asc'},
        action_whitelist: {type: 'string[]', min: 1},
        action_blacklist: {type: 'string[]', min: 1},
    });

    return await getContractActionLogs(
        ctx.db, ctx.coreArgs.atomicassets_account,
        applyActionGreylistFilters(['createcol', 'addcolauth', 'forbidnotify', 'remcolauth', 'remnotifyacc', 'setmarketfee', 'setcoldata'], args),
        {collection_name: ctx.pathParams.collection_name},
        (args.page - 1) * args.limit, args.limit, args.order
    );
}
