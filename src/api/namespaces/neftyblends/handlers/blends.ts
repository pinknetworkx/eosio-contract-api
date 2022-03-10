import {RequestValues} from '../../utils';
import {NeftyBlendsContext} from '../index';
import QueryBuilder from '../../../builder';
import { ApiError } from '../../../error';
import {filterQueryArgs} from '../../validation';
import {fillBlends} from '../filler';

export async function getIngredientOwnershipBlendFilter(params: RequestValues, ctx: NeftyBlendsContext): Promise<any> {
    const args = filterQueryArgs(params, {
        page: {type: 'int', min: 1, default: 1},
        limit: {type: 'int', min: 1, max: 1000, default: 100},
        sort: {type: 'string', allowedValues: ['blend_id', 'created_at_time'], default: 'blend_id'},
        order: {type: 'string', allowedValues: ['asc', 'desc'], default: 'desc'},

        contract: {type: 'string', default: ''},
        collection_name: {type: 'string', default: ''},
        ingredient_owner: {type: 'string', default: ''},
        ingredient_match: {type: 'string', allowedValues: ['all', 'missing_x', 'any'], default: 'any'},
        missing_ingredients: {type: 'int', min: 1, default: 1},
        available_only: {type: 'bool', default: false},
    });

    let queryVarCounter:number = 0;
    const queryValues:any[] = [];
    let queryString:string;
    // If we don't have to figure out if the owner has the assets required to
    // execute the blend the query is a lot simpler, basically just blend_details
    // view
    if(args.ingredient_owner === ''){
        queryString = `
            SELECT 
                blend_detail.*
            FROM
        `;
        // If we have collection_name we use the function because it is a lot
        // faster
        if(args.collection_name !== ''){
            queryValues.push(args.collection_name);
            queryString += `
                neftyblends_blend_details_func($${++queryVarCounter}) blend_detail
            `;
        }
        else{
            queryString += `
                neftyblends_blend_details_master blend_detail
            `;
        }

        // bodge so we can always append `WHERE` to the string, even if no conditions
        // were sent in `args`.
        queryString += `
            WHERE 
                TRUE`
        ;
        if(args.contract !== ''){
            queryValues.push(args.contract);
            queryString += `
                AND blend_detail.contract = $${++queryVarCounter}`
            ;
        }
        if(args.available_only){
            queryString += `
                AND (
                    (blend_detail.start_time = 0 OR (cast(extract(epoch from now()) as bigint) * 1000) >= blend_detail.start_time) AND
                    (blend_detail.end_time = 0 OR (cast(extract(epoch from now()) as bigint) * 1000) <= blend_detail.end_time) AND
                    (blend_detail.max = 0 OR blend_detail.max > blend_detail.use_count)
                )`
            ;
        }
    }
    else{
        if(args.collection_name === ''){
            throw new ApiError('Param: \'collection_name\' is required when param \'ingredient_owner\' is sent', 400);
        }

        queryString=`
        SELECT 
            blend_detail.*
        FROM
        (
            SELECT 
                asset_matches_sub.contract, 
                asset_matches_sub.blend_id, 
                asset_matches_sub.ingredients_count AS "required",
                sum(asset_matches_sub.fulfilled) AS "fulfilled"
            FROM(\n` +
                // The `DISTINCT ON` ensures that the same asset_id is not "matched" twice in the same blend
`               SELECT 
                    b.contract,
                    b.blend_id,
                    b.ingredients_count,
                    i.ingredient_index,
                    i.amount AS "required",
                    count(DISTINCT a.asset_id) AS "owned",
                    least(i.amount, count(DISTINCT a.asset_id)) AS fulfilled
                FROM
                    neftyblends_blends b 
                    JOIN neftyblends_blend_ingredients i ON
                        b.blend_id = i.blend_id
                    JOIN atomicassets_assets a ON 
                        (i.ingredient_type = 'TEMPLATE_INGREDIENT' AND a.template_id = i.template_id) OR
                        (i.ingredient_type = 'SCHEMA_INGREDIENT' AND a.schema_name = i.schema_name) OR
                        (i.ingredient_type = 'ATTRIBUTE_INGREDIENT' AND is_ingredient_attribute_match(a.template_id, b.blend_id, i.ingredient_index, i.total_attributes))
                WHERE`
            ;
        // add `WHERE` conditions in filter subquery:
        {
            queryValues.push(args.ingredient_owner);
            queryString += `
                a.owner = $${++queryVarCounter}`
            ;

            // Out of the assets the user owns, we only care about the ones
            // belonging to this collection. This assumes that a blends can
            // only have ingredients that are from the same collection
            // This saves an absurd amount of time in the query!
            // ~(30 secs to 300ms, for the `asset_matches_sub` subquery!)
            queryValues.push(args.collection_name);
            queryString += `
                AND a.collection_name = $${++queryVarCounter}`
            ;

            // blends in collection
            queryValues.push(args.collection_name);
            queryString += `
                AND b.collection_name = $${++queryVarCounter}`
            ;

            if(args.contract !== ''){
                queryValues.push(args.contract);
                queryString += `
                    AND b.contract = $${++queryVarCounter}`
                ;
            }
            if(args.available_only){
                queryString += `
                    AND (
                        (b.start_time = 0 OR (cast(extract(epoch from now()) as bigint) * 1000) >= b.start_time) AND
                        (b.end_time = 0 OR (cast(extract(epoch from now()) as bigint) * 1000) <= b.end_time) AND
                        (b.max = 0 OR b.max > b.use_count)
                    )`
                ;
            }
        }

        queryString += `
                GROUP BY
                    b.contract,
                    b.blend_id,
                    b.ingredients_count,
                    i.ingredient_index,
                    i.amount
            ) as asset_matches_sub
            GROUP BY
                asset_matches_sub.contract, 
                asset_matches_sub.blend_id,
                asset_matches_sub.ingredients_count
            HAVING 
        `;
        if (args.ingredient_match === 'all') {
            queryString += `
                SUM(asset_matches_sub.fulfilled) >= asset_matches_sub.ingredients_count
            `;
        } else if (args.ingredient_match === 'missing_x') {
            queryString += `
                SUM(asset_matches_sub.fulfilled) >= asset_matches_sub.ingredients_count - ${args.missing_ingredients}
            `;
        } else { // Have at least one
            queryString += `
                SUM(asset_matches_sub.fulfilled) >= 1
            `;
        }

        queryValues.push(args.collection_name);
        queryString += `
        ) as blend_filter_sub 
        JOIN neftyblends_blend_details_func($${++queryVarCounter}) as blend_detail ON
            blend_filter_sub.contract = blend_detail.contract AND
            blend_filter_sub.blend_id = blend_detail.blend_id
        `;
    }

    // This should not lead to sql injection as long as `filterQueryArgs` enforces
    // the allowed values in `sort` and `order`
    queryString += `
    ORDER BY
        blend_detail.${args.sort} ${args.order}`;

    queryValues.push(args.limit);
    queryString += `
    LIMIT $${++queryVarCounter}`;

    queryValues.push((args.page - 1) * args.limit);
    queryString += `
    OFFSET $${++queryVarCounter};`;

    const result = await ctx.db.query(queryString, queryValues);
    return await fillBlends(
        ctx.db,
        ctx.coreArgs.atomicassets_account,
        result.rows
    );
}

export async function getBlendDetails(params: RequestValues, ctx: NeftyBlendsContext): Promise<any> {

    const query = new QueryBuilder(`
        SELECT *  FROM neftyblends_blend_details_master blend_detail
    `);
    query.equal('blend_detail.blend_id', ctx.pathParams.blend_id);
    query.equal('blend_detail.contract', ctx.pathParams.contract);

    const result = await ctx.db.query(query.buildString(), query.buildValues());
    if(result.rows.length < 1){
        return null;
    }
    else{
        const filledBlends = await fillBlends(
            ctx.db,
            ctx.coreArgs.atomicassets_account,
            result.rows
        );
        return filledBlends[0];
    }
}
