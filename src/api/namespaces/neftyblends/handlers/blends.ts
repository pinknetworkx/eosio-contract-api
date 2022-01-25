import {filterQueryArgs, RequestValues} from '../../utils';
import {NeftyBlendsContext} from '../index';
import QueryBuilder from '../../../builder';
import logger from '../../../../utils/winston';
import { ApiError } from '../../../error';

export async function getIngredientOwnershipBlendFilter(params: RequestValues, ctx: NeftyBlendsContext): Promise<any> {
    const args = filterQueryArgs(params, {
        contract: {type: 'string', values: ['blend.nefty', 'blenderizerx'], default: ""},
        collection_name: {type: 'string', default: ""},
        ingredient_owner_id: {type: 'string', default: ""},
        owned_ingredients_amount: {type: 'string', values: ['all', 'one'], default: ""},
        order_by: {type: 'string', values: ['blend_id', 'creation_date'], default: ""},
        must_be_available: {type: 'string', values: ['true', 'false'], default: ""},
    });

    // @TODO: have a different error message for when the query param is not missing 
    // it has an invalid arg value
    if(args.contract === ""){
        throw new ApiError("Missing or invalid required query parameter: contract", 400);
    }
    if(args.collection_name === ""){
        throw new ApiError("Missing or invalid required query parameter: collection_name", 400);
    }
    if(args.ingredient_owner_id === ""){
        throw new ApiError("Missing or invalid required query parameter: ingredient_owner_id", 400);
    }
    if(args.owned_ingredients_amount === ""){
        throw new ApiError( "Missing or invalid required query parameter: owned_ingredients_amount", 400);
    }
    if(args.order_by === ""){
        throw new ApiError( "Missing or invalid required query parameter: order_by", 400);
    }
    if(args.must_be_available === ""){
        throw new ApiError( "Missing or invalid required query parameter: must_be_available", 400);
    }

    let amountToMatch;
    if(args.owned_ingredients_amount === "all"){
        amountToMatch = 'sub.ingredients_count';
    }
    else{
        amountToMatch = '1';
    }
    let must_be_available_condition;
    if(args.must_be_available === "true"){
        let nowEpoch = Date.now();

        must_be_available_condition = `AND (
            (b.start_time = 0 OR ${nowEpoch} >= b.start_time) AND
            (b.end_time = 0 OR ${nowEpoch} <= b.end_time) AND
            (b.max = 0 OR b.max > b.use_count)
        )
        `
    }
    else{
        must_be_available_condition = '';
    }

    // @TODO: Remove query comments
    // @TODO: use the QueryBuilder (if possible) (or at least use the query args
	//        which I think helps avoid sql injection)
    // @TODO: add openapi spec
    // @TODO: return relevant blend info, not just the blend_id
    // @TODO: If we don't have a good constant `order by` the distinct on might
    //        return "unexpected results"
    // @TODO: Add the sql code to create the new function this query uses
    const query = new QueryBuilder(`
		SELECT 
			blend_detail.*
		FROM
			(
				SELECT 
					sub.contract, 
					sub.blend_id, 
					sub.ingredients_count,
					sub.created_at_time as creation_date,
					count(1) ingredient_requirement_fulfilled
				FROM(
					-- The 'DISTINCT ON' ensures that the same asset_id is not "matched" twice in the same blend 
					SELECT DISTINCT ON(b.blend_id, a.asset_id) 
						b.contract, 
						b.blend_id, 
						a.asset_id, 
						b.ingredients_count,
						b.created_at_time 
					FROM
						neftyblends_blends b 
						JOIN neftyblends_blend_ingredients i ON
							b.blend_id = i.blend_id
						JOIN atomicassets_assets a ON 
							(i.ingredient_type = 'TEMPLATE_INGREDIENT' AND a.template_id = i.template_id) OR
							(i.ingredient_type = 'SCHEMA_INGREDIENT' AND a.schema_name = i.schema_name) OR
							(i.ingredient_type = 'ATTRIBUTE_INGREDIENT' AND is_ingredient_attribute_match(a.template_id, b.blend_id, i.ingredient_index, i.total_attributes))
					WHERE
						-- Assets the owner owns 
						a.collection_name = '${args.collection_name}' AND 
						a.owner = '${args.ingredient_owner_id}' AND
						-- blends in collection 
						b.collection_name = '${args.collection_name}' AND
						-- which contract
						b.contract = '${args.contract}'
						${must_be_available_condition}
				) as sub
				group by 
					sub.contract, 
					sub.blend_id, 
					sub.ingredients_count, 
					sub.created_at_time 
				HAVING 
					count(1) >= ${amountToMatch}
				ORDER BY ${args.order_by}
			) as blend_filter_sub 
		JOIN neftyblends_blend_details_master as blend_detail ON
			blend_filter_sub.contract = blend_detail.contract AND
			blend_filter_sub.blend_id = blend_detail.blend_id;
    `);

    const result = await ctx.db.query(query.buildString(), query.buildValues());

    return result.rows;
}

export async function getBlendDetails(params: RequestValues, ctx: NeftyBlendsContext): Promise<any> {

    const query = new QueryBuilder(`
		SELECT *  FROM neftyblends_blend_details_master blend_detail
    `);
    query.equal('blend_detail.blend_id', ctx.pathParams.blend_id);
    query.equal('blend_detail.contract', ctx.pathParams.contract);

    const result = await ctx.db.query(query.buildString(), query.buildValues());
    return result.rows;
}
