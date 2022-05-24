import DataProcessor from '../../../processor';
import { ContractDBTransaction } from '../../../database';
import { EosioContractRow } from '../../../../types/eosio';
import { ShipBlock } from '../../../../types/ship';
import { eosioTimestampToDate } from '../../../../utils/eosio';
import CollectionsListHandler, {
    BlendIngredientType, BlendResultType, BlendsArgs,
    BlendsUpdatePriority, IngredientEffectType,
} from '../index';
import ConnectionManager from '../../../../connections/manager';
import {BlendTableRow} from '../types/tables';
import {Ingredient} from '../types/helpers';
import {
    bulkInsert,
    encodeDatabaseJson,
    getAllRowsFromTable
} from '../../../utils';

export async function initBlends(args: BlendsArgs, connection: ConnectionManager): Promise<void> {
    const superBlendsCount = await connection.database.query(
        'SELECT COUNT(*) FROM neftyblends_blends WHERE assets_contract = $1 AND contract = $2',
        [args.atomicassets_account, args.blenderizer_account]
    );

    if (Number(superBlendsCount.rows[0].count) === 0) {
        const superBlendsTable = await getAllRowsFromTable(connection.chain.rpc, {
            json: true, code: args.blenderizer_account,
            scope: args.blenderizer_account, table: 'blenders'
        }, 1000) as BlendTableRow[];

        const dbMaps = superBlendsTable.map(blend => getBlendDbRows(blend, args, null, null));

        const blendRows = [];
        let ingredientRows: any[] = [];
        const rollsRows: any[] = [];
        const rollOutcomesRows: any[] = [];
        const rollOutcomeResultsRows: any[] = [];
        for (const {
            blendDbRow,
            ingredientDbRows,
            rollDbRow,
            rollOutcomeDbRow,
            rollOutcomeResultDbRow,
        } of dbMaps) {
            blendRows.push(blendDbRow);
            ingredientRows = ingredientRows.concat(ingredientDbRows);
            rollsRows.push(rollDbRow);
            rollOutcomesRows.push(rollOutcomeDbRow);
            rollOutcomeResultsRows.push(rollOutcomeResultDbRow);
        }

        await bulkInsert(connection.database, 'neftyblends_blends', blendRows);
        await bulkInsert(connection.database, 'neftyblends_blend_ingredients', ingredientRows);
        await bulkInsert(connection.database, 'neftyblends_blend_rolls', rollsRows);
        await bulkInsert(connection.database, 'neftyblends_blend_roll_outcomes', rollOutcomesRows);
        await bulkInsert(connection.database, 'neftyblends_blend_roll_outcome_results', rollOutcomeResultsRows);
    }
}

export function blendsProcessor(core: CollectionsListHandler, processor: DataProcessor): () => any {
    const destructors: Array<() => any> = [];
    const blenderizerContracr = core.args.blenderizer_account;

    destructors.push(processor.onContractRow(
        blenderizerContracr, 'blenders',
        async (db: ContractDBTransaction, block: ShipBlock, delta: EosioContractRow<BlendTableRow>): Promise<void> => {
            const deleteString = 'assets_contract = $1 AND contract = $2 AND blend_id = $3';
            const deleteValues = [core.args.atomicassets_account, blenderizerContracr, delta.value.target];
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

            if (delta.present) {
                const {
                    blendDbRow,
                    ingredientDbRows,
                    rollDbRow,
                    rollOutcomeDbRow,
                    rollOutcomeResultDbRow
                } = getBlendDbRows(
                    delta.value, core.args, block.block_num, block.timestamp
                );
                await db.insert('neftyblends_blends', blendDbRow, ['contract', 'blend_id']);
                if (ingredientDbRows.length > 0) {
                    await db.insert(
                        'neftyblends_blend_ingredients',
                        ingredientDbRows,
                        ['contract', 'blend_id', 'ingredient_index']
                    );
                }
                await db.insert(
                    'neftyblends_blend_rolls',
                    rollDbRow,
                    ['contract', 'blend_id', 'roll_index']
                );
                await db.insert(
                    'neftyblends_blend_roll_outcomes',
                    rollOutcomeDbRow,
                    ['contract', 'blend_id', 'roll_index', 'outcome_index']
                );
                await db.insert(
                    'neftyblends_blend_roll_outcome_results',
                    rollOutcomeResultDbRow,
                    ['contract', 'blend_id', 'roll_index', 'outcome_index', 'result_index']
                );
            }
        }, BlendsUpdatePriority.TABLE_BLENDS.valueOf()
    ));

    return (): any => destructors.map(fn => fn());
}

function getBlendDbRows(blend: BlendTableRow, args: BlendsArgs, blockNumber: number, blockTimeStamp: string): any {
    const ingredients = getBlendIngredients(blend);
    const ingredientDbRows = [];
    for (const ingredient of ingredients) {
        ingredientDbRows.push({
            assets_contract: args.atomicassets_account,
            contract: args.blenderizer_account,
            blend_id: blend.target,
            ingredient_collection_name: ingredient.collection_name,
            template_id: ingredient.template_id,
            schema_name: ingredient.schema_name,
            amount: ingredient.amount,
            effect: encodeDatabaseJson(ingredient.effect),
            ingredient_type: ingredient.type,
            ingredient_index: ingredient.index,
            total_attributes: 0,
            updated_at_block: blockNumber || 0,
            updated_at_time: blockTimeStamp ? eosioTimestampToDate(blockTimeStamp).getTime() : 0,
            created_at_block: blockNumber || 0,
            created_at_time: blockTimeStamp ? eosioTimestampToDate(blockTimeStamp).getTime() : 0,
            display_data: ingredient.display_data,
            balance_ingredient_attribute_name: ingredient.balance_ingredient_attribute_name,
            balance_ingredient_cost: ingredient.balance_ingredient_cost,
        });
    }

    return {
        blendDbRow: {
            assets_contract: args.atomicassets_account,
            contract: args.blenderizer_account,
            collection_name: blend.collection,
            blend_id: blend.target,
            start_time: 0,
            end_time: 0,
            max: 0,
            use_count: 0,
            display_data: '',
            ingredients_count: ingredientDbRows.map(({amount}) => amount).reduce((sum,amount) => sum + amount, 0),
            updated_at_block: blockNumber || 0,
            updated_at_time: blockTimeStamp ? eosioTimestampToDate(blockTimeStamp).getTime() : 0,
            created_at_block: blockNumber || 0,
            created_at_time: blockTimeStamp ? eosioTimestampToDate(blockTimeStamp).getTime() : 0,
            security_id: 0,
        },
        ingredientDbRows,
        rollDbRow: {
            assets_contract: args.atomicassets_account,
            contract: args.blenderizer_account,
            blend_id: blend.target,
            total_odds: 1,
            roll_index: 0,
        },
        rollOutcomeDbRow: {
            assets_contract: args.atomicassets_account,
            contract: args.blenderizer_account,
            blend_id: blend.target,
            roll_index: 0,
            odds: 1,
            outcome_index: 0,
        },
        rollOutcomeResultDbRow: {
            assets_contract: args.atomicassets_account,
            contract: args.blenderizer_account,
            blend_id: blend.target,
            roll_index: 0,
            outcome_index: 0,
            payload: encodeDatabaseJson({
                template_id: blend.target,
            }),
            type: BlendResultType.ON_DEMAND_NFT_RESULT,
            result_index: 0,
        },
    };
}

function getBlendIngredients(row: BlendTableRow): Ingredient[] {
    const mixtureSummary = countTemplateOccurrences(row.mixture);

    return mixtureSummary.map(({ count, template_id}, index) => {
        const effect = {
            payload: {
                type: 0,
            },
            type: IngredientEffectType.TYPED_EFFECT,
        };
        return {
            type: BlendIngredientType.TEMPLATE_INGREDIENT,
            collection_name: null,
            schema_name: null,
            template_id: template_id,
            attributes: [],
            typed_attributes: [],
            display_data: null,
            amount: count,
            effect,
            index,
            balance_ingredient_attribute_name: '',
            balance_ingredient_cost: 0,
            ft_ingredient_quantity_price: null,
            ft_ingredient_quantity_symbol: null,
        };
    });
}

function countTemplateOccurrences(array: number[]): { count: number, template_id: number }[] {
    const summary = [];
    let prev = null;
    const sortedArray = [...array].sort((a, b) => a - b);
    for (const template_id of sortedArray) {
        if (template_id === prev) {
            summary[summary.length - 1].count += 1;
        } else {
            summary.push({
                count: 1,
                template_id,
            });
        }
        prev = template_id;
    }
    return summary;
}
