import DataProcessor from '../../../processor';
import { ContractDBTransaction } from '../../../database';
import {EosioActionTrace, EosioContractRow, EosioTransaction} from '../../../../types/eosio';
import { ShipBlock } from '../../../../types/ship';
import { eosioTimestampToDate } from '../../../../utils/eosio';
import CollectionsListHandler, {
    BlendIngredientType, BlendsArgs,
    BlendsUpdatePriority, BlendUpgradeRequirementType,
    BlendUpgradeResultValueType, BlendUpgradeImmediateType,
    
} from '../index';
import ConnectionManager from '../../../../connections/manager';
import { Roll, SuperBlendTableRow, SuperBlendValuerollsTableRow } from '../types/tables';
import {Ingredient} from '../types/helpers';
import {
    bulkInsert,
    encodeDatabaseArray,
    encodeDatabaseJson,
    getAllRowsFromTable
} from '../../../utils';
import {SetBlendRollsActionData} from '../types/actions';
import logger from '../../../../utils/winston';

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
        let upgradeSpecsRows: any[] = [];
        let upgradeRequirementsRows: any[] = [];
        let upgradeResultsRows: any[] = [];
        for (const {
            blendDbRow,
            ingredientDbRows,
            ingredientAttributesDbRows,
            rollsDbRows,
            rollOutcomesDbRows,
            rollOutcomeResultsDbRows,
            upgradeSpecsDbRows,
            upgradeRequirementsDbRows,
            upgradeResultsDbRows
        } of dbMaps) {
            blendRows.push(blendDbRow);
            ingredientRows = ingredientRows.concat(ingredientDbRows);
            ingredientAttributesRows = ingredientAttributesRows.concat(ingredientAttributesDbRows);
            rollsRows = rollsRows.concat(rollsDbRows);
            rollOutcomesRows = rollOutcomesRows.concat(rollOutcomesDbRows);
            rollOutcomeResultsRows = rollOutcomeResultsRows.concat(rollOutcomeResultsDbRows);
            upgradeSpecsRows = upgradeSpecsRows.concat(upgradeSpecsDbRows);
            upgradeRequirementsRows = upgradeRequirementsRows.concat(upgradeRequirementsDbRows);
            upgradeResultsRows = upgradeResultsRows.concat(upgradeResultsDbRows);
        }

        await bulkInsert(connection.database, 'neftyblends_blends', blendRows);
        if (ingredientRows.length > 0) {
            await bulkInsert(connection.database, 'neftyblends_blend_ingredients', ingredientRows);
        }

        if (ingredientAttributesRows.length > 0) {
            await bulkInsert(connection.database, 'neftyblends_blend_ingredient_attributes', ingredientAttributesRows);
        }
        if (rollsRows.length > 0) {
            await bulkInsert(connection.database, 'neftyblends_blend_rolls', rollsRows);
        }
        if (rollOutcomeResultsRows.length > 0) {
            await bulkInsert(connection.database, 'neftyblends_blend_roll_outcomes', rollOutcomesRows);
        }
        if (rollOutcomesRows.length > 0) {
            await bulkInsert(connection.database, 'neftyblends_blend_roll_outcome_results', rollOutcomeResultsRows);
        }
        if (upgradeSpecsRows.length > 0) {
            await bulkInsert(connection.database, 'neftyblends_blend_upgrade_specs', upgradeResultsRows);
        }
        if (upgradeRequirementsRows.length > 0) {
            await bulkInsert(connection.database, 'neftyblends_blend_upgrade_spec_upgrade_requirements', upgradeRequirementsRows);
        }
        if (upgradeResultsRows.length > 0) {
            await bulkInsert(connection.database, 'neftyblends_blend_upgrade_spec_upgrade_results', upgradeResultsRows);
        }
    }
};

export async function initSuperBlends(args: BlendsArgs, connection: ConnectionManager): Promise<void> {
    await fillSuperBlends(args, connection, args.nefty_blender_account);
    await fillSuperBlends(args, connection, args.tag_blender_account);
}

const superBlendsTableListener = (core: CollectionsListHandler, contract: string) => async (db: ContractDBTransaction, block: ShipBlock, delta: EosioContractRow<SuperBlendTableRow>): Promise<void> => {
    const blend = await db.query(
        'SELECT blend_id FROM neftyblends_blends WHERE assets_contract = $1 AND contract = $2 AND blend_id = $3',
        [core.args.atomicassets_account, contract, delta.value.blend_id]
    );

    if (!delta.present) {
        const deleteString = 'assets_contract = $1 AND contract = $2 AND blend_id = $3';
        const deleteValues = [core.args.atomicassets_account, contract, delta.value.blend_id];
        await deleteBlendRolls(db, core.args.atomicassets_account, delta.value.blend_id, contract);
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
            ingredientTypedAttributesDbRows,
            rollsDbRows,
            rollOutcomesDbRows,
            rollOutcomeResultsDbRows,

            upgradeSpecsDbRows,
            upgradeRequirementsDbRows,
            upgradeResultsDbRows
        } = getBlendDbRows(
            delta.value, core.args, block.block_num, block.timestamp, contract
        );
        await db.insert('neftyblends_blends', blendDbRow, ['contract', 'blend_id']);
        if (ingredientDbRows.length > 0) {
            await db.insert(
                'neftyblends_blend_ingredients',
                ingredientDbRows,
                ['contract', 'blend_id', 'ingredient_index']
            );
        }
        if (ingredientAttributesDbRows.length > 0) {
            await db.insert(
                'neftyblends_blend_ingredient_attributes',
                ingredientAttributesDbRows,
                ['contract', 'blend_id', 'ingredient_index', 'attribute_index']
            );
        }
        if (ingredientTypedAttributesDbRows.length > 0) {
            await db.insert(
                'neftyblends_blend_ingredient_typed_attributes',
                ingredientTypedAttributesDbRows,
                ['contract', 'blend_id', 'ingredient_index', 'typed_attribute_index']
            );
        }
        if (rollsDbRows.length > 0) {
            await insertBlendRolls(
                db,
                rollsDbRows,
                rollOutcomesDbRows,
                rollOutcomeResultsDbRows,
            );
        }
        if (upgradeSpecsDbRows.length > 0) {
            await db.insert(
                'neftyblends_blend_upgrade_specs',
                upgradeSpecsDbRows,
                ['contract', 'blend_id', 'upgrade_spec_index']
            );
        }
        if (upgradeRequirementsDbRows.length > 0) {
            await db.insert(
                'neftyblends_blend_upgrade_spec_upgrade_requirements',
                upgradeRequirementsDbRows,
                ['contract', 'blend_id', 'upgrade_spec_index', 'upgrade_requirement_index']
            );
        }
        if (upgradeResultsDbRows.length > 0) {
            await db.insert(
                'neftyblends_blend_upgrade_spec_upgrade_results',
                upgradeResultsDbRows,
                ['contract', 'blend_id', 'upgrade_spec_index', 'upgrade_result_index']
            );
        }
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
            security_id: delta.value.security_id || 0,
            category: delta.value.category || '',
        }, {
            str: 'contract = $1 AND blend_id = $2',
            values: [contract, delta.value.blend_id]
        }, ['contract', 'blend_id']);
    }
};

const superBlendsValuerollsTableListener = (core: CollectionsListHandler, contract: string) => async (db: ContractDBTransaction, block: ShipBlock, delta: EosioContractRow<SuperBlendValuerollsTableRow>): Promise<void> => {
    const valueroll = await db.query(
        'SELECT valueroll_id FROM neftyblends_valuerolls WHERE contract = $1 AND collection_name = $2 AND valueroll_id = $3',
        [contract, delta.scope, delta.value.id ]
    );

    if (!delta.present) {
        await db.delete('neftyblends_valuerolls', {
            str: 'contract = $1 AND collection_name = $2 AND valueroll_id = $3',
            values: [ contract, delta.scope, delta.value.id ],
        });
    } else if (valueroll.rowCount === 0) {
        let valuerollDbRow = {
            contract,
            collection_name: delta.scope,
            valueroll_id: delta.value.id,

            value_outcomes: encodeDatabaseJson(delta.value.value_outcomes),
            total_odds: delta.value.total_odds,

            updated_at_block: block.block_num || 0,
            updated_at_time: block.timestamp ? eosioTimestampToDate(block.timestamp).getTime() : 0,
            created_at_block: block.block_num || 0,
            created_at_time: block.timestamp ? eosioTimestampToDate(block.timestamp).getTime() : 0,
        };
        await db.insert(
            'neftyblends_valuerolls', valuerollDbRow, 
            ['contract', 'collection_name', 'valueroll_id', 'value_outcomes', 
             'total_odds', 'updated_at_block', 'updated_at_time', 
             'created_at_block', 'created_at_time']
        );
    } else {
        await db.update('neftyblends_valuerolls', {
            value_outcomes: encodeDatabaseJson(delta.value.value_outcomes),
            total_odds: delta.value.total_odds,

            updated_at_block: block.block_num || 0,
            updated_at_time: block.timestamp ? eosioTimestampToDate(block.timestamp).getTime() : 0,
        }, {
            str: 'contract = $1 AND collection_name = $2 AND valueroll_id = $3',
            values: [contract, delta.scope, delta.value.id ]

        }, ['contract', 'collection_name', 'valueroll_id']);
    }
};

const superBlendsRollsListener = (core: CollectionsListHandler, contract: string) => async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<SetBlendRollsActionData>): Promise<void> => {
    const {
        rollsDbRows,
        rollOutcomesDbRows,
        rollOutcomeResultsDbRows,
    } = getRollsDbRows(
        trace.act.data.blend_id,
        trace.act.data.rolls,
        core.args, block.block_num,
        block.timestamp,
        contract,
    );
    await deleteBlendRolls(
        db,
        core.args.atomicassets_account,
        trace.act.data.blend_id,
        contract,
    );
    await insertBlendRolls(
        db,
        rollsDbRows,
        rollOutcomesDbRows,
        rollOutcomeResultsDbRows,
    );
};

export function superBlendsProcessor(core: CollectionsListHandler, processor: DataProcessor): () => any {
    const destructors: Array<() => any> = [];
    const neftyContract = core.args.nefty_blender_account;
    const tagContract = core.args.tag_blender_account;

    destructors.push(processor.onContractRow(
        neftyContract, 'blends',
        superBlendsTableListener(core, neftyContract),
        BlendsUpdatePriority.TABLE_BLENDS.valueOf()
    ));

    destructors.push(processor.onActionTrace(
        neftyContract, 'setrolls',
        superBlendsRollsListener(core, neftyContract),
        BlendsUpdatePriority.SET_ROLLS.valueOf()
    ));

    destructors.push(processor.onContractRow(
        tagContract, 'blends',
        superBlendsTableListener(core, tagContract),
        BlendsUpdatePriority.TABLE_BLENDS.valueOf()
    ));

    destructors.push(processor.onActionTrace(
        tagContract, 'setblendroll',
        superBlendsRollsListener(core, tagContract),
        BlendsUpdatePriority.SET_ROLLS.valueOf()
    ));

    destructors.push(processor.onContractRow(
        tagContract, 'valuerolls',
        superBlendsValuerollsTableListener(core, tagContract),
        BlendsUpdatePriority.TABLE_VALUEROLL.valueOf()
    ));

    return (): any => destructors.map(fn => fn());
}

async function insertBlendRolls(
    db: ContractDBTransaction,
    rollsDbRows: any[],
    rollOutcomesDbRows: any[],
    rollOutcomeResultsDbRows: any[]
): Promise<void> {
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
}

async function deleteBlendRolls(
    db: ContractDBTransaction,
    atomicAssetsAccount: string,
    blendId: number,
    contract: string,
): Promise<void> {
    const deleteString = 'assets_contract = $1 AND contract = $2 AND blend_id = $3';
    const deleteValues = [atomicAssetsAccount, contract, blendId];
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
}

function getBlendDbRows(blend: SuperBlendTableRow, args: BlendsArgs, blockNumber: number, blockTimeStamp: string, contract: string): any {
    const ingredients = getSuperBlendIngredients(blend);
    const ingredientDbRows = [];
    const ingredientAttributesDbRows = [];
    const ingredientTypedAttributesDbRows = [];
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
            display_data: ingredient.display_data,
            balance_ingredient_attribute_name: ingredient.balance_ingredient_attribute_name,
            balance_ingredient_cost: ingredient.balance_ingredient_cost,
        });

        let attributeIndex = 0;
        for (const attribute of ingredient.attributes) {
            ingredientAttributesDbRows.push({
                assets_contract: args.atomicassets_account,
                contract,
                blend_id: blend.blend_id,
                ingredient_collection_name: ingredient.collection_name,
                ingredient_index: ingredient.index,
                attribute_index: attributeIndex,
                attribute_name: attribute.attribute_name,
                allowed_values: encodeDatabaseArray(attribute.allowed_values),
            });
            attributeIndex++;
        }

        let typedAttributeIndex = 0;
        for (const typedAttribute of ingredient.typed_attributes) {
            ingredientTypedAttributesDbRows.push({
                contract,
                blend_id: blend.blend_id,
                ingredient_collection_name: ingredient.collection_name,
                ingredient_index: ingredient.index,
                typed_attribute_index: typedAttributeIndex,

                attribute_name: typedAttribute.attribute_name,
                attribute_type: typedAttribute.attribute_type,
                // variant type, and variant value
                allowed_values_type: typedAttribute.allowed_values[0],
                allowed_values: encodeDatabaseJson(typedAttribute.allowed_values[1])
            });
            typedAttributeIndex++;
        }
    }

    let upgradeSpecsDbRows = [ ];
    let upgradeRequirementsDbRows = [ ];
    let upgradeResultsDbRows = [ ];
    if(blend.upgrade_specs) {
        // @todo: put it in a function to declutter the code
        // upgrade_specs
        for (let upgradeSpecIndex = 0; upgradeSpecIndex < blend.upgrade_specs.length; upgradeSpecIndex++){
            const upgradeSpec = blend.upgrade_specs[upgradeSpecIndex];
            upgradeSpecsDbRows.push({
                contract,
                blend_id: blend.blend_id,
                upgrade_spec_index: upgradeSpecIndex,

                schema_name: upgradeSpec.schema_name,
                display_data: upgradeSpec.display_data,
            }) 
            
            // upgrade_requirements
            for (let upgradeRequirementIndex = 0; upgradeRequirementIndex < upgradeSpec.upgrade_requirements.length; upgradeRequirementIndex++){
                const upgradeRequirementType = upgradeSpec.upgrade_requirements[upgradeRequirementIndex][0];
                const upgradeRequirementObject = upgradeSpec.upgrade_requirements[upgradeRequirementIndex][1];

                let newUpgradeRequirementDbRow:any = {
                    contract: contract,
                    blend_id: blend.blend_id,
                    upgrade_spec_index: upgradeSpecIndex,
                    upgrade_requirement_index: upgradeRequirementIndex,

                    type: upgradeRequirementType,
                }
                if (upgradeRequirementType === BlendUpgradeRequirementType.TEMPLATE_REQUIREMENT) {
                    newUpgradeRequirementDbRow.template_id = upgradeRequirementObject.template_id;
                    newUpgradeRequirementDbRow.typed_attribute_definition = null;
                } else if (upgradeRequirementType === BlendUpgradeRequirementType.TYPED_ATTRIBUTE_REQUIREMENT) {
                    newUpgradeRequirementDbRow.template_id = null;
                    newUpgradeRequirementDbRow.typed_attribute_definition = encodeDatabaseJson(upgradeRequirementObject.typed_attribute_definition);
                } 
                // if upgradeRequirementType is not a valid BlendUpgradeRequirement
                // we still want to insert whatever we can into the 
                // blend_requirement table.
                // (this can happen if we add more variant alternatives in the
                // contract)
                else {
                    logger.warn(`Invalid upgradeRequirementType: '${upgradeRequirementType}'`);
                    newUpgradeRequirementDbRow.template_id = null;
                    newUpgradeRequirementDbRow.typed_attribute_definition = null;
                }
                upgradeRequirementsDbRows.push(newUpgradeRequirementDbRow);
            }

            // upgrade_results
            for (let upgradeResultIndex = 0; upgradeResultIndex < upgradeSpec.upgrade_results.length; upgradeResultIndex++){
                const upgradeResultObject = upgradeSpec.upgrade_results[upgradeResultIndex];

                const resultValueType = upgradeResultObject.value[0];
                const resultValueObject = upgradeResultObject.value[1];

                let newUpgradeRequirementDbRow:any = {
                    contract: contract,
                    blend_id: blend.blend_id,
                    upgrade_spec_index: upgradeSpecIndex,
                    upgrade_result_index: upgradeResultIndex,

                    attribute_name: upgradeResultObject.attribute_name,
                    attribute_type: upgradeResultObject.attribute_type,
                    upgrade_operator: encodeDatabaseJson(upgradeResultObject.op),
                    blend_collection_name: blend.collection_name,

                    result_value_type: resultValueType
                }
                if (resultValueType === BlendUpgradeResultValueType.VALUE_ROLL_RESULT) {
                    newUpgradeRequirementDbRow.immediate_type = null;

                    newUpgradeRequirementDbRow.valueroll_id = resultValueObject.valueroll_id
                    newUpgradeRequirementDbRow.immediate_string = null;
                    newUpgradeRequirementDbRow.immediate_uint64 = null;
                } else if (resultValueType === BlendUpgradeResultValueType.IMMEDIATE_VALUE) {
                    let immediateType = resultValueObject[0];
                    let immediateObject = resultValueObject[1];
                    
                    newUpgradeRequirementDbRow.immediate_type = immediateType;
                    if (immediateType === BlendUpgradeImmediateType.STRING) {
                        newUpgradeRequirementDbRow.valueroll_id = null;
                        newUpgradeRequirementDbRow.immediate_string = immediateObject;
                        newUpgradeRequirementDbRow.immediate_uint64 = null;
                    } else if (immediateType === BlendUpgradeImmediateType.UINT64) {
                        newUpgradeRequirementDbRow.valueroll_id = null;
                        newUpgradeRequirementDbRow.immediate_string = null;
                        newUpgradeRequirementDbRow.immediate_uint64 = immediateObject;
                    } else {
                        logger.warn(`Invalid immediateType: '${immediateType}'`);
                        newUpgradeRequirementDbRow.valueroll_id = null;
                        newUpgradeRequirementDbRow.immediate_string = null;
                        newUpgradeRequirementDbRow.immediate_uint64 = null;
                    }
                } else {
                    logger.warn(`Invalid resultValueType: '${resultValueType}'`);

                    newUpgradeRequirementDbRow.immediate_type = null;

                    newUpgradeRequirementDbRow.valueroll_id = null;
                    newUpgradeRequirementDbRow.immediate_string = null;
                    newUpgradeRequirementDbRow.immediate_uint64 = null;
                }
                upgradeResultsDbRows.push(newUpgradeRequirementDbRow);
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
            category: blend.category || '',
        },
        ingredientDbRows,
        ingredientAttributesDbRows,
        ingredientTypedAttributesDbRows,
        ...getRollsDbRows(blend.blend_id, blend.rolls, args, blockNumber, blockTimeStamp, contract),

        upgradeSpecsDbRows,
        upgradeRequirementsDbRows,
        upgradeResultsDbRows
    };
}

function getRollsDbRows(blendId: number, rollsArray: any[], args: BlendsArgs, blockNumber: number, blockTimeStamp: string, contract: string): any {
    const rolls = getSuperBlendRolls(rollsArray);
    const rollsDbRows = [];
    const rollOutcomesDbRows = [];
    const rollOutcomeResultsDbRows = [];
    for (const roll of rolls) {
        rollsDbRows.push({
            assets_contract: args.atomicassets_account,
            contract,
            blend_id: blendId,
            total_odds: roll.total_odds,
            roll_index: roll.roll_index,
        });
        for (const outcome of roll.outcomes) {
            rollOutcomesDbRows.push({
                assets_contract: args.atomicassets_account,
                contract,
                blend_id: blendId,
                roll_index: roll.roll_index,
                odds: outcome.odds,
                outcome_index: outcome.outcome_index,
            });
            for (const result of outcome.results) {
                rollOutcomeResultsDbRows.push({
                    assets_contract: args.atomicassets_account,
                    contract,
                    blend_id: blendId,
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
        rollsDbRows,
        rollOutcomesDbRows,
        rollOutcomeResultsDbRows,
    };
}

function getSuperBlendIngredients(row: SuperBlendTableRow): Ingredient[] {
    const blend_collection = row.collection_name;
    return row.ingredients.map(([type, payload], index) => {
        const [effectType = '', effectPayload = {}] = payload.effect || [];
        const effect = {
            payload: effectPayload,
            type: effectType
        };
        if (type === BlendIngredientType.TEMPLATE_INGREDIENT) {
            return {
                type,
                collection_name: payload.collection_name,
                schema_name: null,
                balance_ingredient_attribute_name: null,
                balance_ingredient_cost: null,
                template_id: payload.template_id,
                attributes: [],
                typed_attributes: [],
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
                balance_ingredient_attribute_name: null,
                balance_ingredient_cost: null,
                template_id: null,
                attributes: [],
                typed_attributes: [],
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
                balance_ingredient_attribute_name: null,
                balance_ingredient_cost: null,
                template_id: null,
                attributes: payload.attributes,
                typed_attributes: [],
                display_data: payload.display_data,
                amount: payload.amount,
                effect,
                index,
            };
        } else if (type === BlendIngredientType.BALANCE_INGREDIENT) {
            return {
                type,
                collection_name: blend_collection,
                schema_name: payload.schema_name,
                balance_ingredient_attribute_name: payload.attribute_name || '',
                balance_ingredient_cost: payload.cost || 0,
                template_id: payload.template_id,
                attributes: [],
                typed_attributes: [],
                display_data: payload.display_data,
                amount: 1,
                effect,
                index,
            };
        } else if (type === BlendIngredientType.TYPED_ATTRIBUTE_INGREDIENT) {
            return {
                type,
                collection_name: blend_collection,
                schema_name: payload.schema_name,
                balance_ingredient_attribute_name: payload.attribute_name || '',
                balance_ingredient_cost: payload.cost || 0,
                template_id: payload.template_id,
                attributes: [],
                typed_attributes: payload.attributes,
                display_data: payload.display_data,
                amount: 1,
                effect,
                index,
            };
        }
    });
}

function getSuperBlendRolls(rolls: any[]): Roll[] {
    return rolls.map(({ outcomes, total_odds}, roll_index) => ({
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
