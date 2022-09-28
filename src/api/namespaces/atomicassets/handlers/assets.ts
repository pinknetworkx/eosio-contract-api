import {
    buildBoundaryFilter,
    RequestValues,
    SortColumn,
    SortColumnMapping
} from '../../utils';
import { AtomicAssetsContext } from '../index';
import QueryBuilder from '../../../builder';
import { buildAssetFilter, buildGreylistFilter, buildHideOffersFilter, hasAssetFilter, hasDataFilters } from '../utils';
import { ApiError } from '../../../error';
import { applyActionGreylistFilters, getContractActionLogs } from '../../../utils';
import { filterQueryArgs, FilterValues } from '../../validation';

export async function buildAssetQueryCondition(
    values: FilterValues, query: QueryBuilder,
    options: { assetTable: string, templateTable?: string }
): Promise<void> {
    const args = await filterQueryArgs(values, {
        authorized_account: {type: 'string', min: 1, max: 12},
        hide_templates_by_accounts: {type: 'string', min: 1},

        only_duplicate_templates: {type: 'bool'},
        has_backed_tokens: {type: 'bool'},

        template_mint: {type: 'int', min: 1},

        min_template_mint: {type: 'int', min: 1},
        max_template_mint: {type: 'int', min: 1},

        template_blacklist: {type: 'string', min: 1},
        template_whitelist: {type: 'string', min: 1}
    });

    if (args.authorized_account) {
        query.addCondition(
            'EXISTS(' +
            'SELECT * FROM atomicassets_collections collection ' +
            'WHERE collection.collection_name = ' + options.assetTable + '.collection_name AND collection.contract = ' + options.assetTable + '.contract ' +
            'AND ' + query.addVariable(args.authorized_account) + ' = ANY(collection.authorized_accounts)' +
            ')'
        );
    }

    if (args.hide_templates_by_accounts) {
        query.addCondition(
            'NOT EXISTS(' +
            'SELECT * FROM atomicassets_assets asset2 ' +
            'WHERE asset2.template_id = ' + options.assetTable + '.template_id AND asset2.contract = ' + options.assetTable + '.contract ' +
            'AND asset2.owner = ANY(' + query.addVariable(args.hide_templates_by_accounts.split(',')) + ')' +
            ')'
        );
    }

    if (args.only_duplicate_templates) {
        query.addCondition(
            'EXISTS (' +
            'SELECT * FROM atomicassets_assets inner_asset ' +
            'WHERE inner_asset.contract = asset.contract AND inner_asset.template_id = ' + options.assetTable + '.template_id ' +
            'AND inner_asset.asset_id < ' + options.assetTable + '.asset_id AND inner_asset.owner = ' + options.assetTable + '.owner' +
            ') AND ' + options.assetTable + '.template_id IS NOT NULL'
        );
    }

    if (typeof args.has_backed_tokens === 'boolean') {
        if (args.has_backed_tokens) {
            query.addCondition('EXISTS (' +
                'SELECT * FROM atomicassets_assets_backed_tokens token ' +
                'WHERE ' + options.assetTable + '.contract = token.contract AND ' + options.assetTable + '.asset_id = token.asset_id' +
                ')');
        } else {
            query.addCondition('NOT EXISTS (' +
                'SELECT * FROM atomicassets_assets_backed_tokens token ' +
                'WHERE ' + options.assetTable + '.contract = token.contract AND ' + options.assetTable + '.asset_id = token.asset_id' +
                ')');
        }
    }

    await buildHideOffersFilter(values, query, options.assetTable);

    if (args.template_mint) {
        query.equal(options.assetTable + '.template_mint', args.template_mint);
    }

    if (args.min_template_mint && args.min_template_mint > 1) {
        const condition = options.assetTable + '.template_mint >= ' + query.addVariable(args.min_template_mint);

        query.addCondition('(' + condition + ')');
    }

    if (args.max_template_mint) {
        const condition = options.assetTable + '.template_mint <= ' + query.addVariable(args.max_template_mint)
            + ' OR ' + options.assetTable + '.template_id IS NULL';

        query.addCondition('(' + condition + ')');
    }

    await buildAssetFilter(values, query, {assetTable: options.assetTable, templateTable: options.templateTable});
    await buildGreylistFilter(values, query, {collectionName: options.assetTable + '.collection_name'});

    if (args.template_blacklist) {
        query.notMany(`COALESCE(${options.assetTable}.template_id, 9223372036854775807)`, args.template_blacklist.split(','));
    }

    if (args.template_whitelist) {
        query.equalMany(options.assetTable + '.template_id', args.template_whitelist.split(','));
    }
}

export async function getRawAssetsAction(
    {search, match, ...params}: RequestValues,
    ctx: AtomicAssetsContext,
    options?: {extraTables: string, extraSort: SortColumnMapping}): Promise<Array<number> | string> {
    const maxLimit = ctx.coreArgs.limits?.assets || 1000;
    const args = await filterQueryArgs(params, {
        page: {type: 'int', min: 1, default: 1},
        limit: {type: 'int', min: 1, max: maxLimit, default: Math.min(maxLimit, 100)},
        sort: {type: 'string', min: 1},
        order: {type: 'string', allowedValues: ['asc', 'desc'], default: 'desc'},

        count: {type: 'bool'}
    });

    const query = new QueryBuilder(
        'SELECT asset.asset_id FROM atomicassets_assets asset ' +
        'LEFT JOIN atomicassets_templates "template" ON (' +
        'asset.contract = template.contract AND asset.template_id = template.template_id' +
        ') '
    );
    if (options?.extraTables) {
        query.appendToBase(options.extraTables);
    }

    query.equal('asset.contract', ctx.coreArgs.atomicassets_account);

    await buildAssetQueryCondition(params, query, {assetTable: '"asset"', templateTable: '"template"'});
    await buildBoundaryFilter(
        params, query, 'asset.asset_id', 'int',
        args.sort === 'updated' ? 'asset.updated_at_time' : 'asset.minted_at_time'
    );

    const hasStrongTemplateFilter = await addTemplateFilter(query, ctx, match, search);

    if (args.count) {
        const countQuery = await ctx.db.query(
            'SELECT COUNT(*) counter FROM (' + query.buildString() + ') x',
            query.buildValues()
        );

        return countQuery.rows[0].counter;
    }

    let sorting: SortColumn;

    if (args.sort) {
        const sortColumnMapping: SortColumnMapping = {
            asset_id: {column: 'asset.asset_id', nullable: false, numericIndex: true},
            updated: {column: 'asset.updated_at_time', nullable: false, numericIndex: true},
            transferred: {column: 'asset.transferred_at_time', nullable: false, numericIndex: true},
            minted: {column: 'asset.asset_id', nullable: false, numericIndex: true},
            template_mint: {column: 'asset.template_mint', nullable: true, numericIndex: true},
            name: {column: `(COALESCE(asset.mutable_data, '{}') || COALESCE(asset.immutable_data, '{}') || COALESCE(template.immutable_data, '{}'))->>'name'`, nullable: true, numericIndex: false},
            ...options?.extraSort,
        };

        sorting = sortColumnMapping[args.sort];
    }

    if (!sorting) {
        sorting = {column: 'asset.asset_id', nullable: false, numericIndex: true};
    }

    const ignoreIndex = (hasStrongTemplateFilter || hasAssetFilter(params) || hasDataFilters(params))
        && sorting.numericIndex;

    query.append('ORDER BY ' + sorting.column + (ignoreIndex ? ' + 1 ' : ' ') + args.order + ' ' + (sorting.nullable ? 'NULLS LAST' : '') + ', asset.asset_id ASC');
    query.paginate(args.page, args.limit);

    const result = await ctx.db.query(query.buildString(), query.buildValues());
    return result.rows.map((row: any) => row.asset_id);
}

async function addTemplateFilter(query: QueryBuilder, ctx: AtomicAssetsContext, match?: string, search?: string): Promise<boolean> {
    const templateFilters = [];
    const sqlParams = [ctx.coreArgs.atomicassets_account];

    if (typeof match === 'string' && match.length > 0) {
        templateFilters.push(`(immutable_data->>'name') ILIKE $${sqlParams.push('%' + query.escapeLikeVariable(match) + '%')}`);
    }

    if (typeof search === 'string' && search.length > 0) {
        templateFilters.push(`$${sqlParams.push('%' + query.escapeLikeVariable(search) + '%')}::TEXT <% (immutable_data->>'name')`);
    }

    if (!templateFilters.length) {
        return false;
    }

    const sql = `
        WITH templates AS (
            SELECT template_id
            FROM atomicassets_templates
            WHERE contract = $1
                AND ${templateFilters.join(' AND ')}
        )
        SELECT ARRAY_AGG(DISTINCT templates.template_id) template_id, COALESCE(SUM(ac.assets), 0)::INT assets
        FROM templates
            LEFT OUTER JOIN atomicassets_asset_counts ac ON ac.contract = $1 AND templates.template_id = ac.template_id
    `;

    const {rows: [row]} = await ctx.db.query(sql, sqlParams);

    if (row.template_id?.length) {
        query.equalMany('asset.template_id', row.template_id);
    } else {
        query.addCondition('FALSE');
    }

    return row.assets <= 1_100_000;
}

export async function getAssetsCountAction(params: RequestValues, ctx: AtomicAssetsContext): Promise<any> {
    return getRawAssetsAction({...params, count: 'true'}, ctx);
}

export async function getAssetStatsAction(params: RequestValues, ctx: AtomicAssetsContext): Promise<any> {
    const assetQuery = await ctx.db.query(
        'SELECT * FROM atomicassets_assets WHERE contract = $1 AND asset_id = $2',
        [this.core.args.atomicassets_account, ctx.pathParams.params.asset_id]
    );

    if (assetQuery.rowCount === 0) {
        throw new ApiError('Asset not found', 416);
    }

    const asset = assetQuery.rows[0];

    const query = await ctx.db.query(
        'SELECT COUNT(*) template_mint FROM atomicassets_assets WHERE contract = $1 AND asset_id <= $2 AND template_id = $3 AND schema_name = $4 AND collection_name = $5',
        [this.core.args.atomicassets_account, asset.asset_id, asset.template_id, asset.schema_name, asset.collection_name]
    );

    return query.rows[0];
}

export async function getAssetLogsAction(params: RequestValues, ctx: AtomicAssetsContext): Promise<any> {
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
        applyActionGreylistFilters(['logmint', 'logburnasset', 'logbackasset', 'logsetdata'], args),
        {asset_id: ctx.pathParams.asset_id},
        (args.page - 1) * args.limit, args.limit, args.order
    );
}
