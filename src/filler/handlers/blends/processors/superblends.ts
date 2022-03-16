import DataProcessor from '../../../processor';
import { ContractDBTransaction } from '../../../database';
import { EosioContractRow } from '../../../../types/eosio';
import { ShipBlock } from '../../../../types/ship';
import { eosioTimestampToDate } from '../../../../utils/eosio';
import CollectionsListHandler, {
    BlendIngredientType, BlendsArgs,
    BlendsUpdatePriority,
} from '../index';
import ConnectionManager from '../../../../connections/manager';
import {Roll, SuperBlendTableRow} from '../types/tables';
import {Ingredient} from '../types/helpers';
import {
    bulkInsert,
    encodeDatabaseArray,
    encodeDatabaseJson,
    getAllRowsFromTable
} from '../../../utils';

const fillSuperBlends = async (args: BlendsArgs, connection: ConnectionManager, contract: string): Promise<void> => {
    const superBlendsCount = await connection.database.query(
        'SELECT COUNT(*) FROM neftyblends_blends WHERE assets_contract = $1 AND contract = $2',
        [args.atomicassets_account, contract]
    );

    if (Number(superBlendsCount.rows[0].count) === 0) {
        const superBlendsTable = await getAllRowsFromTable(connection.chain.rpc, {
            json: true, code: contract,
            scope: contract, table: 'blends'
        }, 1000) as SuperBlendTableRow[];

        const dbMaps = superBlendsTable.map(blend => getBlendDbRows(blend, args, null, null, contract));

        const blendRows = [];
        let ingredientRows: any[] = [];
        let ingredientAttributesRows: any[] = [];
        let rollsRows: any[] = [];
        let rollOutcomesRows: any[] = [];
        let rollOutcomeResultsRows: any[] = [];
        for (const {
            blendDbRow,
            ingredientDbRows,
            ingredientAttributesDbRows,
            rollsDbRows,
            rollOutcomesDbRows,
            rollOutcomeResultsDbRows,
        } of dbMaps) {
            blendRows.push(blendDbRow);
            ingredientRows = ingredientRows.concat(ingredientDbRows);
            ingredientAttributesRows = ingredientAttributesRows.concat(ingredientAttributesDbRows);
            rollsRows = rollsRows.concat(rollsDbRows);
            rollOutcomesRows = rollOutcomesRows.concat(rollOutcomesDbRows);
            rollOutcomeResultsRows = rollOutcomeResultsRows.concat(rollOutcomeResultsDbRows);
        }

        await bulkInsert(connection.database, 'neftyblends_blends', blendRows);
        await bulkInsert(connection.database, 'neftyblends_blend_ingredients', ingredientRows);

        if (ingredientAttributesRows.length > 0) {
            await bulkInsert(connection.database, 'neftyblends_blend_ingredient_attributes', ingredientAttributesRows);
        }
        await bulkInsert(connection.database, 'neftyblends_blend_rolls', rollsRows);
        await bulkInsert(connection.database, 'neftyblends_blend_roll_outcomes', rollOutcomesRows);
        await bulkInsert(connection.database, 'neftyblends_blend_roll_outcome_results', rollOutcomeResultsRows);
    }
};

export async function initSuperBlends(args: BlendsArgs, connection: ConnectionManager): Promise<void> {
    await fillSuperBlends(args, connection, args.nefty_blender_account);
    await fillSuperBlends(args, connection, args.tag_blender_account);
}

const superBlendsListener = (core: CollectionsListHandler, contract: string) => async (db: ContractDBTransaction, block: ShipBlock, delta: EosioContractRow<SuperBlendTableRow>): Promise<void> => {
    const blend = await db.query(
        'SELECT blend_id FROM neftyblends_blends WHERE assets_contract = $1 AND contract = $2 AND blend_id = $3',
        [core.args.atomicassets_account, contract, delta.value.blend_id]
    );

    if (!delta.present) {
        const deleteString = 'assets_contract = $1 AND contract = $2 AND blend_id = $3';
        const deleteValues = [core.args.atomicassets_account, contract, delta.value.blend_id];
        await db.delete('neftyblends_blend_roll_outcome_results', {
            str: deleteString,
            values: deleteValues,
        });
        await db.delete('neftyblends_blend_roll_outcomes', {
            str: deleteString,
            values: deleteValues,
        });
        await db.delete('neftyblends_blend_rolls', {
            str: deleteString,
            values: deleteValues,
        });
        await db.delete('neftyblends_blend_ingredient_attributes', {
            str: deleteString,
            values: deleteValues,
        });
        await db.delete('neftyblends_blend_ingredients', {
            str: deleteString,
            values: deleteValues,
        });
        await db.delete('neftyblends_blends', {
            str: deleteString,
            values: deleteValues,
        });
    } else if (blend.rowCount === 0) {
        const {
            blendDbRow,
            ingredientDbRows,
            ingredientAttributesDbRows,
            rollsDbRows,
            rollOutcomesDbRows,
            rollOutcomeResultsDbRows,
        } = getBlendDbRows(
            delta.value, core.args, block.block_num, block.timestamp, contract
        );
        await db.insert('neftyblends_blends', blendDbRow, ['contract', 'blend_id']);
        await db.insert(
            'neftyblends_blend_ingredients',
            ingredientDbRows,
            ['contract', 'blend_id', 'ingredient_index']
        );
        if (ingredientAttributesDbRows.length > 0) {
            await db.insert(
                'neftyblends_blend_ingredient_attributes',
                ingredientAttributesDbRows,
                ['contract', 'blend_id', 'ingredient_index', 'attribute_index']
            );
        }
        await db.insert(
            'neftyblends_blend_rolls',
            rollsDbRows,
            ['contract', 'blend_id', 'roll_index']
        );
        await db.insert(
            'neftyblends_blend_roll_outcomes',
            rollOutcomesDbRows,
            ['contract', 'blend_id', 'roll_index', 'outcome_index']
        );
        await db.insert(
            'neftyblends_blend_roll_outcome_results',
            rollOutcomeResultsDbRows,
            ['contract', 'blend_id', 'roll_index', 'outcome_index', 'result_index']
        );
    } else {
        await db.update('neftyblends_blends', {
            start_time: delta.value.start_time * 1000,
            end_time: delta.value.end_time * 1000,
            max: delta.value.max,
            use_count: delta.value.use_count,
            display_data: delta.value.display_data,
            updated_at_block: block.block_num,
            updated_at_time: eosioTimestampToDate(block.timestamp).getTime(),
            is_hidden: delta.value.is_hidden || false,
        }, {
            str: 'contract = $1 AND blend_id = $2',
            values: [contract, delta.value.blend_id]
        }, ['contract', 'blend_id']);
    }
};

export function superBlendsProcessor(core: CollectionsListHandler, processor: DataProcessor): () => any {
    const destructors: Array<() => any> = [];
    const neftyContract = core.args.nefty_blender_account;
    const tagContract = core.args.tag_blender_account;

    destructors.push(processor.onContractRow(
        neftyContract, 'blends',
        superBlendsListener(core, neftyContract),
        BlendsUpdatePriority.TABLE_FEATURES.valueOf()
    ));

    destructors.push(processor.onContractRow(
        tagContract, 'blends',
        superBlendsListener(core, tagContract),
        BlendsUpdatePriority.TABLE_FEATURES.valueOf()
    ));

    return (): any => destructors.map(fn => fn());
}

function getBlendDbRows(blend: SuperBlendTableRow, args: BlendsArgs, blockNumber: number, blockTimeStamp: string, contract: string): any {
    const ingredients = getSuperBlendIngredients(blend);
    const ingredientDbRows = [];
    const ingredientAttributesDbRows = [];
    for (const ingredient of ingredients) {
        ingredientDbRows.push({
            assets_contract: args.atomicassets_account,
            contract,
            blend_id: blend.blend_id,
            ingredient_collection_name: ingredient.collection_name,
            template_id: ingredient.template_id,
            schema_name: ingredient.schema_name,
            amount: ingredient.amount,
            effect: encodeDatabaseJson(ingredient.effect),
            ingredient_index: ingredient.index,
            ingredient_type: ingredient.type,
            total_attributes: ingredient.attributes.length || 0,
            updated_at_block: blockNumber || 0,
            updated_at_time: blockTimeStamp ? eosioTimestampToDate(blockTimeStamp).getTime() : 0,
            created_at_block: blockNumber || 0,
            created_at_time: blockTimeStamp ? eosioTimestampToDate(blockTimeStamp).getTime() : 0,
        });

        let index = 0;
        for (const attribute of ingredient.attributes) {
            ingredientAttributesDbRows.push({
                assets_contract: args.atomicassets_account,
                contract,
                blend_id: blend.blend_id,
                ingredient_collection_name: ingredient.collection_name,
                ingredient_index: ingredient.index,
                attribute_index: index,
                attribute_name: attribute.attribute_name,
                allowed_values: encodeDatabaseArray(attribute.allowed_values),
            });
            index++;
        }
    }

    const rolls = getSuperBlendRolls(blend);
    const rollsDbRows = [];
    const rollOutcomesDbRows = [];
    const rollOutcomeResultsDbRows = [];
    for (const roll of rolls) {
        rollsDbRows.push({
            assets_contract: args.atomicassets_account,
            contract,
            blend_id: blend.blend_id,
            total_odds: roll.total_odds,
            roll_index: roll.roll_index,
        });
        for (const outcome of roll.outcomes) {
            rollOutcomesDbRows.push({
                assets_contract: args.atomicassets_account,
                contract,
                blend_id: blend.blend_id,
                roll_index: roll.roll_index,
                odds: outcome.odds,
                outcome_index: outcome.outcome_index,
            });
            for (const result of outcome.results) {
                rollOutcomeResultsDbRows.push({
                    assets_contract: args.atomicassets_account,
                    contract,
                    blend_id: blend.blend_id,
                    roll_index: roll.roll_index,
                    outcome_index: outcome.outcome_index,
                    payload: encodeDatabaseJson(result.payload),
                    type: result.type,
                    result_index: result.result_index,
                });
            }
        }
    }

    return {
        blendDbRow: {
            assets_contract: args.atomicassets_account,
            contract,
            collection_name: blend.collection_name,
            blend_id: blend.blend_id,
            start_time: blend.start_time * 1000,
            end_time: blend.end_time * 1000,
            max: blend.max,
            use_count: blend.use_count,
            display_data: blend.display_data,
            ingredients_count: ingredientDbRows.map(({amount}) => amount).reduce((sum,amount) => sum + amount, 0),
            updated_at_block: blockNumber || 0,
            updated_at_time: blockTimeStamp ? eosioTimestampToDate(blockTimeStamp).getTime() : 0,
            created_at_block: blockNumber || 0,
            created_at_time: blockTimeStamp ? eosioTimestampToDate(blockTimeStamp).getTime() : 0,
            security_id: blend.security_id || 0,
            is_hidden: blend.is_hidden || false,
        },
        ingredientDbRows,
        ingredientAttributesDbRows,
        rollsDbRows,
        rollOutcomesDbRows,
        rollOutcomeResultsDbRows,
    };
}

function getSuperBlendIngredients(row: SuperBlendTableRow): Ingredient[] {
    return row.ingredients.map(([type, payload], index) => {
        const [effectType, effectPayload] = payload.effect;
        const effect = {
            payload: effectPayload,
            type: effectType
        };
        if (type === BlendIngredientType.TEMPLATE_INGREDIENT) {
            return {
                type,
                collection_name: payload.collection_name,
                schema_name: null,
                template_id: payload.template_id,
                attributes: [],
                display_data: null,
                amount: payload.amount,
                effect,
                index,
            };
        } else if (type === BlendIngredientType.SCHEMA_INGREDIENT) {
            return {
                type,
                collection_name: payload.collection_name,
                schema_name: payload.schema_name,
                template_id: null,
                attributes: [],
                display_data: payload.display_data,
                amount: payload.amount,
                effect,
                index,
            };
        } else if (type === BlendIngredientType.ATTRIBUTE_INGREDIENT) {
            return {
                type,
                collection_name: payload.collection_name,
                schema_name: payload.schema_name,
                template_id: null,
                attributes: payload.attributes,
                display_data: payload.display_data,
                amount: payload.amount,
                effect,
                index,
            };
        }
    });
}

function getSuperBlendRolls(row: SuperBlendTableRow): Roll[] {
    return row.rolls.map(({ outcomes, total_odds}, roll_index) => ({
        total_odds,
        roll_index,
        outcomes: outcomes.map(({odds, results}: {odds: number, results: any[]}, outcome_index: number) => ({
          odds,
          outcome_index,
          results: results.map(([type, payload], result_index) => ({
              type,
              payload,
              result_index,
          })),
        })),
    }));
}
