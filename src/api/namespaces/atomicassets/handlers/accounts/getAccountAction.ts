import {RequestValues} from '../../../utils';
import {AtomicAssetsContext} from '../../index';
import {QueryResult} from 'pg';
import QueryBuilder from '../../../../builder';
import {buildGreylistFilter, buildHideOffersFilter} from '../../utils';
import {ICollection, ITemplate} from 'atomicassets/build/API/Explorer/Objects';
import {formatCollection, formatSchema, formatTemplate} from '../../format';
import {ISchema} from 'atomicassets/build/Schema';

/**
 * Retrieves the account stats lie collection and assets count and templates
 */
export async function getAccountAction(params: RequestValues, ctx: AtomicAssetsContext): Promise<{
    collections: Array<{
        collection: ICollection;
        assets: string;
    }>;
    schemas: Array<{
        schema: ISchema;
        assets: string;
    }>;
    templates: Array<{
        template: ITemplate;
        collection_name: string;
        template_id: string;
        assets: string;
    }>;
    assets: string;
}> {
    const templateCount = await getAssetCountByTemplate(params, ctx);

    if (templateCount.rows.length === 0) {
        return {
            collections: [],
            schemas: [],
            templates: [],
            assets: '0'
        };
    }

    const collections = await ctx.db.query(`SELECT json_object_agg(collection_name, row_to_json(c)) collection_lookup
        FROM (SELECT *, created_at_block::text, created_at_time::text FROM atomicassets_collections_master) c WHERE contract = $1 AND collection_name = ANY ($2)`,
        [ctx.coreArgs.atomicassets_account, templateCount.rows.map((row: any) => row.collection_name)]
    );
    const collectionLookup: { [key: string]: any } = collections.rows[0].collection_lookup || {};

    let nbVariables = 1;
    const valuePlaceholders = templateCount.rows.map(() => `($${++nbVariables}::text, $${++nbVariables}::text)`).join(', ');

    const schemas = await ctx.db.query(
        `SELECT json_object_agg(collection_name || ':' || schema_name, row_to_json(s)) schema_lookup
        FROM (SELECT *, created_at_block::text, created_at_time::text FROM atomicassets_schemas_master WHERE contract = $1 AND (collection_name, schema_name) IN (${valuePlaceholders})) s`,
        [ctx.coreArgs.atomicassets_account, ...templateCount.rows.map((row: any) => [row.collection_name, row.schema_name]).flat()]
    );
    const schemaLookup: { [key: string]: any } = schemas.rows[0].schema_lookup || {};

    const templates = await ctx.db.query(
        `SELECT json_object_agg(template_id, row_to_json(t)) template_lookup
        FROM (SELECT *, issued_supply::text, max_supply::text, created_at_block::text, created_at_time::text FROM atomicassets_templates_master WHERE contract = $1 AND template_id = ANY ($2)) t`,
        [ctx.coreArgs.atomicassets_account, templateCount.rows.map((row: any) => row.template_id)]
    );
    const templateLookup: { [key: string]: any } = templates.rows[0].template_lookup || {};

    const result = templateCount.rows.reduce((acc, item) => {
        const nftCount = Number(item.assets);
        if (!acc.collections[item.collection_name]) {
            acc.collections[item.collection_name] = {
                collection: formatCollection(collectionLookup[item.collection_name]),
                assets: 0,
            };
        }
        if (!acc.schemas[`${item.collection_name}:${item.schema_name}`]) {
            acc.schemas[`${item.collection_name}:${item.schema_name}`] = {
                schema: formatSchema(schemaLookup[`${item.collection_name}:${item.schema_name}`]),
                assets: 0,
            };
        }
        if (item.template_id) {
            if (!acc.templates[item.template_id]) {
                acc.templates[item.template_id] = {
                    template: {
                        ...formatTemplate(templateLookup[item.template_id]),
                        template_id: item.template_id,
                    },
                    assets: 0,
                };
            }
            acc.templates[item.template_id].assets += nftCount;
        }
        acc.collections[item.collection_name].assets += nftCount;
        acc.schemas[`${item.collection_name}:${item.schema_name}`].assets += nftCount;
        acc.assets += nftCount;
        return acc;
    }, {
        collections: {} as Record<string, { collection: ICollection; assets: number }>,
        schemas: {} as Record<string, { schema: ISchema; assets: number }>,
        templates: {} as Record<string, { template: ITemplate; assets: number }>,
        assets: 0,
    });

    return {
        collections: Object.values(result.collections).map(({collection, assets}) => ({ collection, assets: assets.toString() })),
        templates: Object.values(result.templates).map(({template, assets}) => ({
            template,
            template_id: template.template_id,
            collection_name: template.collection.collection_name,
            assets: assets.toString(),
        })),
        schemas: Object.values(result.schemas).map(({schema, assets}) => ({ schema, assets: assets.toString() })),
        assets: result.assets.toString(),
    };
}

async function getAssetCountByTemplate(params: RequestValues, ctx: AtomicAssetsContext): Promise<QueryResult<{
    collection_name: string;
    assets: string;
    schema_name: string;
    template_id: null | string;
}>> {
    const templateQuery = new QueryBuilder(
        'SELECT collection_name, schema_name, template_id, COUNT(*) as assets ' +
        'FROM atomicassets_assets asset'
    );
    templateQuery.equal('contract', ctx.coreArgs.atomicassets_account);
    templateQuery.equal('owner', ctx.pathParams.account);

    await buildGreylistFilter(params, templateQuery, {collectionName: 'asset.collection_name'});
    await buildHideOffersFilter(params, templateQuery, 'asset');

    templateQuery.group(['contract', 'collection_name', 'schema_name', 'template_id']);
    templateQuery.append('ORDER BY assets DESC');

    return ctx.db.query(templateQuery.buildString(), templateQuery.buildValues());
}

