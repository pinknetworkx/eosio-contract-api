import {filterQueryArgs, RequestValues} from '../../utils';
import {NeftyBlendsContext} from '../index';
import QueryBuilder from '../../../builder';
import logger from '../../../../utils/winston';
import { ApiError } from '../../../error';

export async function getIngredientOwnershipBlendFilter(params: RequestValues, ctx: NeftyBlendsContext): Promise<any> {
    const args = filterQueryArgs(params, {
        collection_name: {type: 'string', default: ""},
        ingredient_owner_id: {type: 'string', default: ""},
        owned_ingredients_amount: {type: 'string', values: ['all', 'one'], default: ""}
    });

    if(args.collection_name === ""){
        throw new ApiError("Missing required query parameter: collection_name", 400);
    }
    if(args.ingredient_owner_id === ""){
        throw new ApiError("Missing required query parameter: ingredient_owner_id");
    }
    if(args.owned_ingredients_amount === ""){
        throw new ApiError( "Missing required query parameter: owned_ingredients_amount");
    }

    // @TODO: distinguish between 'all' and 'one'
    // @TODO: use the QueryBuilder (if possible)
    // @TODO: remove query comments
    // @TODO: add openapi spec
    // @TODO: return relevant blend info, not just the blend_id
    // @TODO: If we don't have a good constant `order by` the distinct on might
    //        return "unexpected results"
    const query = new QueryBuilder(`
        SELECT 
            sub.blend_id, 
            sub.ingredients_count,
            count(1) ingredient_requirement_fulfilled
        FROM(
            SELECT DISTINCT ON(b.blend_id, a.asset_id) /* ensures that the same asset_id is not "matched" twice in the same blend */ 
                b.blend_id, 
                a.asset_id, 
                b.ingredients_count
            FROM
                neftyblends_blends b 
                JOIN neftyblends_blend_ingredients i ON
                    b.blend_id = i.blend_id
                JOIN atomicassets_assets a ON 
                    (i.ingredient_type = 'TEMPLATE_INGREDIENT' AND a.template_id = i.template_id) OR
                    (i.ingredient_type = 'SCHEMA_INGREDIENT' AND a.schema_name = i.schema_name) OR
                    (i.ingredient_type = 'ATTRIBUTE_INGREDIENT' AND is_ingredient_attribute_match(a.template_id, b.blend_id, i.ingredient_index, i.total_attributes))
            WHERE 
                /* Assets the owner owns */
                a.collection_name = '${args.collection_name}' AND 
                a.owner = '${args.ingredient_owner_id}' AND
                /* blends in collection */
                b.collection_name = '${args.collection_name}' 
        ) as sub
        group by sub.blend_id, sub.ingredients_count
        HAVING 
            count(1) >= sub.ingredients_count;
        -- worse yet: 381ms
        -- best yet: 170ms
    `);

    const result = await ctx.db.query(query.buildString(), query.buildValues());

    return result.rows;
}
