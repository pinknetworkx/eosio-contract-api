import { buildBoundaryFilter, RequestValues } from '../../utils';
import { AtomicAssetsContext } from '../index';
import QueryBuilder from '../../../builder';
import { buildGreylistFilter } from '../utils';
import { formatSchema } from '../format';
import { ApiError } from '../../../error';
import { applyActionGreylistFilters, getContractActionLogs } from '../../../utils';
import { filterQueryArgs } from '../../validation';

export async function getSchemasAction(params: RequestValues, ctx: AtomicAssetsContext): Promise<any> {
    const maxLimit = ctx.coreArgs.limits?.schemas || 1000;
    const args = await filterQueryArgs(params, {
        page: {type: 'int', min: 1, default: 1},
        limit: {type: 'int', min: 1, max: maxLimit, default: Math.min(maxLimit, 100)},
        sort: {type: 'string', allowedValues: ['created', 'schema_name', 'assets'], default: 'created'},
        order: {type: 'string', allowedValues: ['asc', 'desc'], default: 'desc'},

        authorized_account: {type: 'string', min: 1, max: 12},
        collection_name: {type: 'list[]', min: 1},
        schema_name: {type: 'list[]', min: 1},

        match: {type: 'string', min: 1, max: 12},

        count: {type: 'bool'}
    });

    const query = new QueryBuilder(`
        WITH asset_count AS (
            SELECT contract, collection_name, schema_name, SUM(assets)::INT assets
            FROM atomicassets_asset_counts
            GROUP BY contract, collection_name, schema_name
        )
        SELECT m.*, COALESCE(ac.assets, 0) assets
        FROM atomicassets_schemas_master m
            LEFT OUTER JOIN asset_count ac USING (contract, collection_name, schema_name)
    `);
    query.equal('contract', ctx.coreArgs.atomicassets_account);

    if (args.collection_name.length) {
        query.equalMany('collection_name', args.collection_name);
    }

    if (args.schema_name.length) {
        query.equalMany('schema_name', args.schema_name);
    }

    if (args.authorized_account) {
        query.addCondition(query.addVariable(args.authorized_account) + ' = ANY(authorized_accounts)');
    }

    if (args.match) {
        query.addCondition('POSITION(' + query.addVariable(args.match.toLowerCase()) + ' IN schema_name) > 0');
    }

    await buildBoundaryFilter(params, query, 'schema_name', 'string', 'created_at_time');
    await buildGreylistFilter(params, query, {collectionName: 'collection_name'});

    if (args.count) {
        const countQuery = await ctx.db.query(
            'SELECT COUNT(*) counter FROM (' + query.buildString() + ') x',
            query.buildValues()
        );

        return countQuery.rows[0].counter;
    }

    const sortColumnMapping: {[key: string]: string} = {
        created: 'created_at_time',
        schema_name: 'schema_name',
        assets: 'ac.assets',
    };

    query.append('ORDER BY ' + sortColumnMapping[args.sort] + ' ' + args.order + ' NULLS LAST, schema_name ASC');
    query.paginate(args.page, args.limit);

    const result = await ctx.db.query(query.buildString(), query.buildValues());

    return result.rows.map(formatSchema);
}

export async function getSchemasCountAction(params: RequestValues, ctx: AtomicAssetsContext): Promise<any> {
    return getSchemasAction({...params, count: 'true'}, ctx);
}

export async function getSchemaAction(params: RequestValues, ctx: AtomicAssetsContext): Promise<any> {
    const schemas = await getSchemasAction({
        collection_name: ctx.pathParams.collection_name,
        schema_name: ctx.pathParams.schema_name,
    }, ctx);

    if (schemas.rowCount === 0) {
        throw new ApiError('Schema not found', 404);
    }

    return schemas[0];
}

export async function getSchemaStatsAction(params: RequestValues, ctx: AtomicAssetsContext): Promise<any> {
    const query = await ctx.db.query(`
        WITH asset_counts AS (
            SELECT
                SUM(assets) assets,
                SUM(burned) burned
            FROM atomicassets_asset_counts
            WHERE contract = $1
                AND collection_name = $2
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
    const args = await filterQueryArgs(params, {
        page: {type: 'int', min: 1, default: 1},
        limit: {type: 'int', min: 1, max: maxLimit, default: Math.min(maxLimit, 100)},
        order: {type: 'string', allowedValues: ['asc', 'desc'], default: 'asc'},
        action_whitelist: {type: 'string[]', min: 1},
        action_blacklist: {type: 'string[]', min: 1},
    });

    return await getContractActionLogs(
        ctx.db, ctx.coreArgs.atomicassets_account,
        applyActionGreylistFilters(['createschema', 'extendschema'], args),
        {collection_name: ctx.pathParams.collection_name, schema_name: ctx.pathParams.schema_name},
        (args.page - 1) * args.limit, args.limit, args.order
    );
}
