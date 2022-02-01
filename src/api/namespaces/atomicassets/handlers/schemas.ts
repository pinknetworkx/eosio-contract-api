import { buildBoundaryFilter, RequestValues } from '../../utils';
import { AtomicAssetsContext } from '../index';
import QueryBuilder from '../../../builder';
import { buildGreylistFilter } from '../utils';
import { formatSchema } from '../format';
import { ApiError } from '../../../error';
import { applyActionGreylistFilters, getContractActionLogs } from '../../../utils';
import { filterQueryArgs } from '../../validation';

export async function getSchemasAction(params: RequestValues, ctx: AtomicAssetsContext): Promise<any> {
    const maxLimit = ctx.coreArgs.limits?.schemas;
    const args = filterQueryArgs(params, {
        page: {type: 'int', min: 1, default: 1},
        limit: {type: 'int', min: 1, max: maxLimit, default: Math.min(maxLimit, 100)},
        sort: {type: 'string', allowedValues: ['created', 'schema_name'], default: 'created'},
        order: {type: 'string', allowedValues: ['asc', 'desc'], default: 'desc'},

        authorized_account: {type: 'string', min: 1, max: 12},
        collection_name: {type: 'string', min: 1},
        schema_name: {type: 'string', min: 1},

        match: {type: 'string', min: 1, max: 12},

        count: {type: 'bool'}
    });

    const query = new QueryBuilder('SELECT * FROM atomicassets_schemas_master');
    query.equal('contract', ctx.coreArgs.atomicassets_account);

    if (args.collection_name) {
        query.equalMany('collection_name', args.collection_name.split(','));
    }

    if (args.schema_name) {
        query.equalMany('schema_name', args.schema_name.split(','));
    }

    if (args.authorized_account) {
        query.addCondition(query.addVariable(args.authorized_account) + ' = ANY(authorized_accounts)');
    }

    if (args.match) {
        query.addCondition('POSITION(' + query.addVariable(args.match.toLowerCase()) + ' IN schema_name) > 0');
    }

    buildBoundaryFilter(params, query, 'schema_name', 'string', 'created_at_time');
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
        schema_name: 'schema_name'
    };

    query.append('ORDER BY ' + sortColumnMapping[args.sort] + ' ' + args.order + ', schema_name ASC');
    query.paginate(args.page, args.limit);

    const result = await ctx.db.query(query.buildString(), query.buildValues());

    return result.rows.map(formatSchema);
}

export async function getSchemasCountAction(params: RequestValues, ctx: AtomicAssetsContext): Promise<any> {
    return getSchemasAction({...params, count: 'true'}, ctx);
}

export async function getSchemaAction(params: RequestValues, ctx: AtomicAssetsContext): Promise<any> {
    const query = await ctx.db.query(
        'SELECT * FROM atomicassets_schemas_master WHERE contract = $1 AND collection_name = $2 AND schema_name = $3',
        [ctx.coreArgs.atomicassets_account, ctx.pathParams.collection_name, ctx.pathParams.schema_name]
    );

    if (query.rowCount === 0) {
        throw new ApiError('Schema not found', 416);
    }

    return formatSchema(query.rows[0]);
}

export async function getSchemaStatsAction(params: RequestValues, ctx: AtomicAssetsContext): Promise<any> {
    const query = await ctx.db.query(`
        WITH asset_counts AS (
            SELECT
                COUNT(*) assets,
                COUNT(*) FILTER (WHERE owner IS NULL) burned
            FROM atomicassets_assets
            WHERE contract = $1
                AND collection_name || '' = $2 -- prevent collection index usage because the schema index is better
                AND schema_name = $3
        )
        SELECT
            (SELECT assets FROM asset_counts) assets,
            (SELECT burned FROM asset_counts) burned,
            (SELECT COUNT(*) FROM atomicassets_templates WHERE contract = $1 AND collection_name = $2 AND schema_name = $3) templates    
    `, [ctx.coreArgs.atomicassets_account, ctx.pathParams.collection_name, ctx.pathParams.schema_name]
    );

    return query.rows[0];
}

export async function getSchemaLogsAction(params: RequestValues, ctx: AtomicAssetsContext): Promise<any> {
    const maxLimit = ctx.coreArgs.limits?.logs || 100;
    const args = filterQueryArgs(params, {
        page: {type: 'int', min: 1, default: 1},
        limit: {type: 'int', min: 1, max: maxLimit, default: Math.min(maxLimit, 100)},
        order: {type: 'string', allowedValues: ['asc', 'desc'], default: 'asc'}
    });

    return await getContractActionLogs(
        ctx.db, ctx.coreArgs.atomicassets_account,
        applyActionGreylistFilters(['createschema', 'extendschema'], args),
        {collection_name: ctx.pathParams.collection_name, schema_name: ctx.pathParams.schema_name},
        (args.page - 1) * args.limit, args.limit, args.order
    );
}
