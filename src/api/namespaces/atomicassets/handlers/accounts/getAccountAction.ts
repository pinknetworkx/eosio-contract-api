import {RequestValues} from '../../../utils';
import {AtomicAssetsContext} from '../../index';
import {QueryResult} from 'pg';
import QueryBuilder from '../../../../builder';
import {buildGreylistFilter, buildHideOffersFilter} from '../../utils';
import {IAccountStats, ICollection} from 'atomicassets/build/API/Explorer/Objects';
import {formatCollection} from '../../format';

/**
 * Retrieves the account stats lie collection and assets count and templates
 */
export async function getAccountAction(params: RequestValues, ctx: AtomicAssetsContext): Promise<IAccountStats> {
    const collectionCount = await getAssetCountByCollection(params, ctx);
    const templateCount = await getAssetCountByTemplate(params, ctx);

    const collections = await ctx.db.query(
        'SELECT * FROM atomicassets_collections_master WHERE contract = $1 AND collection_name = ANY ($2)',
        [ctx.coreArgs.atomicassets_account, collectionCount.rows.map(row => row.collection_name)]
    );

    const collectionMapper = collections.rows.reduce<Record<string, ICollection>>(
        (accumulator, current) => {
            accumulator[current.collection_name] = formatCollection(current);
            return accumulator;
        },
        {},
    );

    return {
        collections: collectionCount.rows.map(row => ({
            collection: collectionMapper[row.collection_name],
            assets: row.assets
        })),
        templates: templateCount.rows,
        assets: collectionCount.rows.reduce((prev, current) => prev + parseInt(current.assets, 10), 0).toString(),
    };
}

function getAssetCountByCollection(params: RequestValues, ctx: AtomicAssetsContext): Promise<QueryResult<{
    collection_name: string;
    assets: string;
}>> {
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

    return ctx.db.query(collectionQuery.buildString(), collectionQuery.buildValues());
}

function getAssetCountByTemplate(params: RequestValues, ctx: AtomicAssetsContext): Promise<QueryResult<{
    collection_name: string;
    assets: string;
    template_id: null | string;
}>> {
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

    return ctx.db.query(templateQuery.buildString(), templateQuery.buildValues());
}

