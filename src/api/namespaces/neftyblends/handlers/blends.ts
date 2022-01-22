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

    // @TODO: use the QueryBuilder (if possible)
    // @TODO: add openapi spec
    // @TODO: return relevant blend info, not just the blend_id
    // @TODO: If we don't have a good constant `order by` the distinct on might
    //        return "unexpected results"
    // @TODO: Add the sql code to create the new function this query uses
    const query = new QueryBuilder(`
        SELECT 
            sub.blend_id, 
            sub.ingredients_count,
            sub.created_at_time as creation_date,
            count(1) ingredient_requirement_fulfilled
        FROM(\n` + 
        // The `DISTINCT ON` ensures that the same asset_id is not "matched" twice in the same blend 
           `SELECT DISTINCT ON(b.blend_id, a.asset_id) 
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
            WHERE\n` +
                // Assets the owner owns 
               `a.collection_name = '${args.collection_name}' AND 
                a.owner = '${args.ingredient_owner_id}' AND\n` +
                // blends in collection 
               `b.collection_name = '${args.collection_name}' AND\n` +
                // which contract
               `b.contract = '${args.contract}' 
               ${must_be_available_condition}
        ) as sub
        group by sub.blend_id, sub.ingredients_count, sub.created_at_time 
        HAVING 
            count(1) >= ${amountToMatch}
        ORDER BY ${args.order_by};
    `);

    const result = await ctx.db.query(query.buildString(), query.buildValues());

    return result.rows;
}

export async function getBlendDetails(params: RequestValues, ctx: NeftyBlendsContext): Promise<any> {
    const args = filterQueryArgs(params, {
        page: {type: 'int', min: 1, default: 1},
        limit: {type: 'int', min: 1, max: 10000, default: 1000},
        // @TODO
        sort: {type: 'string', values: ['blend_id', 'collection_name'], default: 'blend_id'},
        order: {type: 'string', values: ['asc', 'desc'], default: 'desc'},

        ids: {type: 'string', default: ""},
    });


    // @TODO: Pagination makes more sense here?

    // @TODO: have a different error message for when the query param is not missing 
    // it has an invalid arg value
    if(args.ids === ""){
        throw new ApiError("Missing or invalid required query parameter: ids", 400);
    }

    let ids = args.ids.split(',');

    // @TODO @BIG-BUG: DON'T FORGET: THE CONTRACT IS A RELEVANT PART OF 
    // THE PRIMARY KEY OF PRETTY MUCH ALL OF THE TABLES WE USE HERE!
    const query = new QueryBuilder(`
    SELECT 
	blend.blend_id, 
	blend.contract, 
	blend.collection_name,
 	jsonb_agg(jsonb_build_object(
		'ingredient_type', ingredient.ingredient_type,
		'ingredient_amount', ingredient.amount,
		CASE
			WHEN ingredient.ingredient_type = 'TEMPLATE_INGREDIENT' THEN 'template'
			WHEN ingredient.ingredient_type = 'SCHEMA_INGREDIENT' THEN 'schema'
			WHEN ingredient.ingredient_type = 'ATTRIBUTE_INGREDIENT' THEN 'attributes'
		END,
		CASE
			WHEN ingredient.ingredient_type = 'TEMPLATE_INGREDIENT' THEN
				jsonb_build_object(
					'contract', temp_ing_sub.contract,
					'template_id', temp_ing_sub.template_id,
					'transferable is_transferable', temp_ing_sub.transferable,
					'burnable is_burnable', temp_ing_sub.burnable,
					'issued_supply', temp_ing_sub.issued_supply,
					'max_supply', temp_ing_sub.max_supply,
					'collection_name', temp_ing_sub.collection_name,
					'authorized_accounts', temp_ing_sub.collection_authorized_accounts,
					'collection', jsonb_build_object(
						'collection_name', temp_ing_sub.collection_collection_name,
						'name', temp_ing_sub.collection_data->>'name',
						'img', temp_ing_sub.collection_data->>'img',
						'author', temp_ing_sub.collection_author,
						'allow_notify', temp_ing_sub.collection_allow_notify,
						'authorized_accounts', temp_ing_sub.collection_authorized_accounts,
						'notify_accounts', temp_ing_sub.collection_notify_accounts,
						'market_fee', temp_ing_sub.collection_market_fee,
						'created_at_block', temp_ing_sub.collection_created_at_block::text,
						'created_at_time', temp_ing_sub.collection_created_at_time::text
					),
					'schema_name', temp_ing_sub.schema_name,
					'schema', jsonb_build_object(
						'schema_name', temp_ing_sub.schema_schema_name,
						'format', temp_ing_sub.schema_format,
						'created_at_block', temp_ing_sub.schema_created_at_block::text,
						'created_at_time', temp_ing_sub.schema_created_at_time::text
					),
					'immutable_data', temp_ing_sub.immutable_data,
					'created_at_time', temp_ing_sub.created_at_time,
					'created_at_block', temp_ing_sub.created_at_block
				)
		WHEN 
			ingredient.ingredient_type = 'SCHEMA_INGREDIENT' THEN
				jsonb_build_object(
					'format', schema_ing_sub.collection_name, 
					'schema_name', schema_ing_sub.schema_name, 
					'collection_name', schema_ing_sub.format,
					'collection', jsonb_build_object(
						'collection_name', schema_ing_sub.collection_collection_name,
						'name', schema_ing_sub.collection_data->>'name',
						'img', schema_ing_sub.collection_data->>'img',
						'author', schema_ing_sub.collection_author,
						'allow_notify', schema_ing_sub.collection_allow_notify,
						'authorized_accounts', schema_ing_sub.collection_authorized_accounts,
						'notify_accounts', schema_ing_sub.collection_notify_accounts,
						'market_fee', schema_ing_sub.collection_market_fee,
						'created_at_block', schema_ing_sub.collection_created_at_block::text,
						'created_at_time', schema_ing_sub.collection_created_at_time::text
					),
					'created_at_time', schema_ing_sub.created_at_time, 
					'created_at_block', schema_ing_sub.created_at_block
				)
		WHEN 
			ingredient.ingredient_type = 'ATTRIBUTE_INGREDIENT' THEN
					attribute_ing_sub.attributes
		END
	)) as ingredients,
	jsonb_agg(jsonb_build_object(
		'total_odds', roll_sub.total_odds,
		'outcomes', roll_sub.outcomes
	)) as rolls
FROM 
	neftyblends_blends blend
	JOIN 
		neftyblends_blend_ingredients "ingredient" ON
		ingredient.blend_id = blend.blend_id
	LEFT JOIN (
		SELECT
			template.contract as contract,
			template_id as template_id,
			transferable as transferable,
			burnable as burnable,
			issued_supply as issued_supply,
			max_supply as max_supply,
			"template".collection_name as collection_name,
			collection.collection_name as collection_collection_name,
			collection.data as collection_data,
			collection.author as collection_author,
			collection.allow_notify as collection_allow_notify,
			collection.authorized_accounts as collection_authorized_accounts,
			collection.notify_accounts as collection_notify_accounts,
			collection.market_fee as collection_market_fee,
			collection.created_at_block as collection_created_at_block,
			collection.created_at_time as collection_created_at_time,
			"template".schema_name as schema_name,
			"schema".schema_name as schema_schema_name,
			"schema".format as schema_format,
			"schema".created_at_block as schema_created_at_block,
			"schema".created_at_time as schema_created_at_time,
			immutable_data as immutable_data,
			"template".created_at_time as created_at_time,
			"template".created_at_block as created_at_block
		FROM
			atomicassets_templates "template" 
			JOIN 
				atomicassets_collections collection ON
					"template".collection_name = collection.collection_name
			JOIN 
				atomicassets_schemas "schema" ON
					"template".collection_name = "schema".collection_name AND
					"template".schema_name = "schema".schema_name
	) as temp_ing_sub ON
		ingredient.ingredient_type = 'TEMPLATE_INGREDIENT' AND 
		temp_ing_sub.template_id = ingredient.template_id
	LEFT JOIN (
		SELECT
			"schema".collection_name as collection_name,
			"schema".schema_name as schema_name,
			"schema".format as format,
			collection.collection_name as collection_collection_name,
			collection.data as collection_data,
			collection.author as collection_author,
			collection.allow_notify as collection_allow_notify,
			collection.authorized_accounts as collection_authorized_accounts,
			collection.notify_accounts as collection_notify_accounts,
			collection.market_fee as collection_market_fee,
			collection.created_at_block as collection_created_at_block,
			collection.created_at_time as collection_created_at_time,
			"schema".created_at_time as created_at_time,
			"schema".created_at_block as created_at_block
		FROM atomicassets_schemas "schema"
			JOIN 
				atomicassets_collections collection ON
					"schema".collection_name = collection.collection_name
	)as schema_ing_sub ON
		ingredient.ingredient_type = 'SCHEMA_INGREDIENT' AND 
		schema_ing_sub.collection_name = ingredient.ingredient_collection_name AND
		schema_ing_sub.schema_name = ingredient.schema_name
	LEFT JOIN(
		SELECT 
			ing_attribute.blend_id,
			ing_attribute.ingredient_index,
			jsonb_agg(jsonb_build_object(
				'name', ing_attribute.attribute_name,
				'allowed_values', ing_attribute.allowed_values
			)) as "attributes"
		FROM
			neftyblends_blend_ingredient_attributes ing_attribute
		GROUP BY
			ing_attribute.blend_id, ing_attribute.ingredient_index
	) as attribute_ing_sub ON
		ingredient.ingredient_type = 'ATTRIBUTE_INGREDIENT' AND 
		attribute_ing_sub.blend_id = ingredient.blend_id AND
		attribute_ing_sub.ingredient_index = ingredient.ingredient_index
LEFT JOIN(
	SELECT 
		roll.blend_id,
		roll.roll_index,
		roll.total_odds as total_odds,
		jsonb_agg(jsonb_build_object(
			'odds', outcome_sub.odds,
			'results', outcome_sub.results
		)) as outcomes
	FROM
		neftyblends_blend_rolls roll
	LEFT JOIN (
		SELECT 
			outcome.contract,
			outcome.blend_id,
			outcome.roll_index,
			outcome.outcome_index,
			outcome.odds,
			jsonb_agg(jsonb_build_object(
				-- @TODO? maybe add a property with the result type as well
				case when "result"."type" = 'POOL_NFT_RESULT' then 'pool'
				when "result"."type" = 'ON_DEMAND_NFT_RESULT' then 'template'
				end,
				-- @TODO: if ON_DEMAND_NFT_RESULT we have to build the template object
				-- just like we did with ingredients
				"result".payload
			)) as results
		FROM
			neftyblends_blend_roll_outcomes as outcome
			JOIN neftyblends_blend_roll_outcome_results as "result" ON
				outcome.contract = "result".contract AND
				outcome.blend_id = "result".blend_id AND
				outcome.roll_index = "result".roll_index AND
				outcome.outcome_index = "result".outcome_index
		GROUP BY
			outcome.contract,
			outcome.blend_id,
			outcome.roll_index,
			outcome.outcome_index,
			outcome.odds
	) as outcome_sub ON
		outcome_sub.contract = roll.contract AND
		outcome_sub.blend_id = roll.blend_id AND
		outcome_sub.roll_index = roll.roll_index
	group by
		roll.blend_id, roll.roll_index, roll.total_odds
) as roll_sub ON
	roll_sub.blend_id = blend.blend_id
            `);
    query.equalMany('blend.blend_id', ids);
    query.append(`
        GROUP BY
            blend.blend_id, 
            blend.contract, 
            blend.collection_name
    `)

    const result = await ctx.db.query(query.buildString(), query.buildValues());
    return result.rows;
}
