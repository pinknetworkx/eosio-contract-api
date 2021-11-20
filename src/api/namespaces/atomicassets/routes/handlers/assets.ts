import { buildBoundaryFilter, filterQueryArgs, RequestValues } from '../../../utils';
import { AtomicAssetsContext } from '../../index';
import QueryBuilder from '../../../../builder';
import { hasAssetFilter, hasDataFilters } from '../../utils';
import { buildAssetQueryCondition } from '../assets';
import { ApiError } from '../../../../error';
import { applyActionGreylistFilters, getContractActionLogs } from '../../../../utils';

export async function getRawAssetsAction(params: RequestValues, ctx: AtomicAssetsContext): Promise<any> {
    const args = filterQueryArgs(params, {
        page: {type: 'int', min: 1, default: 1},
        limit: {type: 'int', min: 1, max: 1000, default: 100},
        sort: {type: 'string', min: 1},
        order: {type: 'string', values: ['asc', 'desc'], default: 'desc'},

        count: {type: 'bool'}
    });

    const query = new QueryBuilder(
        'SELECT asset.asset_id FROM atomicassets_assets asset ' +
        'LEFT JOIN atomicassets_templates "template" ON (' +
        'asset.contract = template.contract AND asset.template_id = template.template_id' +
        ') '
    );

    query.equal('asset.contract', ctx.core.args.atomicassets_account);

    buildAssetQueryCondition(params, query, {assetTable: '"asset"', templateTable: '"template"'});
    buildBoundaryFilter(
        params, query, 'asset.asset_id', 'int',
        args.sort === 'updated' ? 'asset.updated_at_time' : 'asset.minted_at_time'
    );

    if (args.count) {
        const countQuery = await ctx.db.query(
            'SELECT COUNT(*) counter FROM (' + query.buildString() + ') x',
            query.buildValues()
        );

        return countQuery.rows[0].counter;
    }

    let sorting: {column: string, nullable: boolean, numericIndex: boolean};

    if (args.sort) {
        const sortColumnMapping: {[key: string]: {column: string, nullable: boolean, numericIndex: boolean}} = {
            asset_id: {column: 'asset.asset_id', nullable: false, numericIndex: true},
            updated: {column: 'asset.updated_at_time', nullable: false, numericIndex: true},
            transferred: {column: 'asset.transferred_at_time', nullable: false, numericIndex: true},
            minted: {column: 'asset.asset_id', nullable: false, numericIndex: true},
            template_mint: {column: 'asset.template_mint', nullable: true, numericIndex: false},
            name: {column: '"template".immutable_data->>\'name\'', nullable: true, numericIndex: false}
        };

        sorting = sortColumnMapping[args.sort];
    }

    if (!sorting) {
        sorting = {column: 'asset.asset_id', nullable: false, numericIndex: true};
    }

    const ignoreIndex = (hasAssetFilter(params) || hasDataFilters(params)) && sorting.numericIndex;

    query.append('ORDER BY ' + sorting.column + (ignoreIndex ? ' + 1 ' : ' ') + args.order + ' ' + (sorting.nullable ? 'NULLS LAST' : '') + ', asset.asset_id ASC');
    query.paginate(args.page, args.limit);

    return await ctx.db.query(query.buildString(), query.buildValues());
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
    const args = filterQueryArgs(params, {
        page: {type: 'int', min: 1, default: 1},
        limit: {type: 'int', min: 1, max: 100, default: 100},
        order: {type: 'string', values: ['asc', 'desc'], default: 'asc'},
        action_whitelist: {type: 'string', min: 1},
        action_blacklist: {type: 'string', min: 1}
    });

    return await getContractActionLogs(
        ctx.db, ctx.core.args.atomicassets_account,
        applyActionGreylistFilters(['logmint', 'logburnasset', 'logbackasset', 'logsetdata'], args),
        {asset_id: ctx.pathParams.asset_id},
        (args.page - 1) * args.limit, args.limit, args.order
    );
}
