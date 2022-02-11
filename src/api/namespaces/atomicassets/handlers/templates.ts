import { buildBoundaryFilter, RequestValues } from '../../utils';
import { AtomicAssetsContext } from '../index';
import QueryBuilder from '../../../builder';
import { buildDataConditions, buildGreylistFilter } from '../utils';
import { formatTemplate } from '../format';
import { ApiError } from '../../../error';
import { applyActionGreylistFilters, getContractActionLogs } from '../../../utils';
import { filterQueryArgs } from '../../validation';

export async function getTemplatesAction(params: RequestValues, ctx: AtomicAssetsContext): Promise<any> {
    const maxLimit = ctx.coreArgs.limits?.templates || 1000;
    const args = filterQueryArgs(params, {
        page: {type: 'int', min: 1, default: 1},
        limit: {type: 'int', min: 1, max: maxLimit, default: Math.min(maxLimit, 100)},
        sort: {type: 'string', allowedValues: ['created', 'name'], default: 'created'},
        order: {type: 'string', allowedValues: ['asc', 'desc'], default: 'desc'},

        collection_name: {type: 'string', min: 1},
        schema_name: {type: 'string', min: 1},
        authorized_account: {type: 'string', min: 1, max: 12},

        issued_supply: {type: 'int', min: 0},
        min_issued_supply: {type: 'int', min: 0},
        max_issued_supply: {type: 'int', min: 0},
        has_assets: {type: 'bool'},

        max_supply: {type: 'int', min: 0},
        is_transferable: {type: 'bool'},
        is_burnable: {type: 'bool'},

        count: {type: 'bool'}
    });

    const query = new QueryBuilder('SELECT "template".template_id FROM atomicassets_templates "template"');

    query.equal('"template".contract', ctx.coreArgs.atomicassets_account);

    buildDataConditions(params, query, {templateTable: '"template"'});

    if (args.collection_name) {
        query.equalMany('template.collection_name', args.collection_name.split(','));
    }

    if (args.schema_name) {
        query.equalMany('template.schema_name', args.schema_name.split(','));
    }

    if (typeof args.issued_supply === 'number') {
        query.equal('template.issued_supply', args.issued_supply);
    }

    if (typeof args.min_issued_supply === 'number') {
        query.addCondition('template.issued_supply >= ' + query.addVariable(args.min_issued_supply));
    }

    if (typeof args.max_issued_supply === 'number') {
        query.addCondition('template.issued_supply <= ' + query.addVariable(args.max_issued_supply));
    }

    if (args.has_assets) {
        query.addCondition(
            'EXISTS(' +
            'SELECT * FROM atomicassets_assets asset ' +
            'WHERE template.contract = asset.contract AND template.template_id = asset.template_id AND owner IS NOT NULL' +
            ')'
        );
    }

    if (typeof args.max_supply === 'number') {
        query.equal('template.max_supply', args.max_supply);
    }

    if (typeof args.is_transferable === 'boolean') {
        if (args.is_transferable) {
            query.addCondition('template.transferable = TRUE');
        } else {
            query.addCondition('template.transferable = FALSE');
        }
    }

    if (typeof args.is_burnable === 'boolean') {
        if (args.is_burnable) {
            query.addCondition('template.burnable = TRUE');
        } else {
            query.addCondition('template.burnable = FALSE');
        }
    }

    if (args.authorized_account) {
        query.addCondition(
            'EXISTS(' +
            'SELECT * FROM atomicassets_collections collection ' +
            'WHERE collection.collection_name = template.collection_name AND collection.contract = template.contract ' +
            'AND ' + query.addVariable(args.authorized_account) + ' = ANY(collection.authorized_accounts)' +
            ')'
        );
    }

    buildBoundaryFilter(params, query, 'template.template_id', 'int', 'template.created_at_time');
    buildGreylistFilter(params, query, {collectionName: 'collection_name'});

    if (args.count) {
        const countQuery = await ctx.db.query(
            'SELECT COUNT(*) counter FROM (' + query.buildString() + ') x',
            query.buildValues()
        );

        return countQuery.rows[0].counter;
    }

    const sortColumnMapping: {[key: string]: string} = {
        name: 'immutable_data->>\'name\'',
        created: 'template_id'
    };

    query.append('ORDER BY ' + sortColumnMapping[args.sort] + ' ' + args.order + ', template_id ASC');
    query.paginate(args.page, args.limit);

    const templateQuery = await ctx.db.query(query.buildString(), query.buildValues());

    const templateLookup: {[key: string]: any} = {};
    const result = await ctx.db.query(
        'SELECT * FROM atomicassets_templates_master WHERE contract = $1 AND template_id = ANY ($2)',
        [ctx.coreArgs.atomicassets_account, templateQuery.rows.map((row: any) => row.template_id)]
    );

    result.rows.reduce((prev: any, current: any) => {
        prev[String(current.template_id)] = current;

        return prev;
    }, templateLookup);

    return templateQuery.rows.map((row: any) => formatTemplate(templateLookup[String(row.template_id)]));
}

export async function getTemplatesCountAction(params: RequestValues, ctx: AtomicAssetsContext): Promise<any> {
    return getTemplatesAction({...params, count: 'true'}, ctx);
}

export async function getTemplateAction(params: RequestValues, ctx: AtomicAssetsContext): Promise<any> {
    const query = await ctx.db.query(
        'SELECT * FROM atomicassets_templates_master WHERE contract = $1 AND template_id = $2 LIMIT 1',
        [ctx.coreArgs.atomicassets_account, ctx.pathParams.template_id]
    );

    if (query.rowCount === 0) {
        throw new ApiError('Template not found', 416);
    }

    return formatTemplate(query.rows[0]);
}

export async function getTemplateStatsAction(params: RequestValues, ctx: AtomicAssetsContext): Promise<any> {
    const query = await ctx.db.query(
        `SELECT SUM(assets) AS assets, SUM(burned) AS burned
                FROM atomicassets_template_counts
                WHERE contract = $1 AND template_id = $2`,
        [ctx.coreArgs.atomicassets_account, ctx.pathParams.template_id]
    );

    return {assets: query.rows[0].assets || '0', burned: query.rows[0].burned || '0'};
}

export async function getTemplateLogsAction(params: RequestValues, ctx: AtomicAssetsContext): Promise<any> {
    const maxLimit = ctx.coreArgs.limits?.logs || 100;
    const args = filterQueryArgs(params, {
        page: {type: 'int', min: 1, default: 1},
        limit: {type: 'int', min: 1, max: maxLimit, default: Math.min(maxLimit, 100)},
        order: {type: 'string', allowedValues: ['asc', 'desc'], default: 'asc'}
    });

    return await getContractActionLogs(
        ctx.db, ctx.coreArgs.atomicassets_account,
        applyActionGreylistFilters(['lognewtempl', 'locktemplate'], args),
        {collection_name: ctx.pathParams.collection_name, template_id: parseInt(ctx.pathParams.template_id, 10)},
        (args.page - 1) * args.limit, args.limit, args.order
    );
}
