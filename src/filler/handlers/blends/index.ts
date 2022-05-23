import * as fs from 'fs';
import { PoolClient } from 'pg';

import { ContractHandler } from '../interfaces';
import logger from '../../../utils/winston';
import Filler from '../../filler';
import { ATOMICASSETS_BASE_PRIORITY } from '../atomicassets';
import DataProcessor from '../../processor';
import {superBlendsProcessor, initSuperBlends} from './processors/superblends';
import {blendsProcessor, initBlends} from './processors/blends';
import {ConfigTableRow} from './types/tables';
import {configProcessor} from './processors/config';

export const BLENDS_BASE_PRIORITY = ATOMICASSETS_BASE_PRIORITY + 3000;

export type BlendsArgs = {
    atomicassets_account: string,
    nefty_blender_account: string,
    tag_blender_account: string,
    blenderizer_account: string,
    store_config: boolean,
};

export enum BlendIngredientType {
    TEMPLATE_INGREDIENT = 'TEMPLATE_INGREDIENT',
    ATTRIBUTE_INGREDIENT = 'ATTRIBUTE_INGREDIENT',
    SCHEMA_INGREDIENT = 'SCHEMA_INGREDIENT',
    COLLECTION_INGREDIENT = 'COLLECTION_INGREDIENT',
    BALANCE_INGREDIENT = 'BALANCE_INGREDIENT',
    TYPED_ATTRIBUTE_INGREDIENT = 'TYPED_ATTRIBUTE_INGREDIENT',
    FT_INGREDIENT = 'FT_INGREDIENT',
}

export enum BlendResultType {
    POOL_NFT_RESULT = 'POOL_NFT_RESULT',
    ON_DEMAND_NFT_RESULT = 'ON_DEMAND_NFT_RESULT',
    ON_DEMAND_NFT_RESULT_WITH_ATTRIBUTES = 'ON_DEMAND_NFT_RESULT_WITH_ATTRIBUTES',
}

export enum IngredientEffectType {
    TYPED_EFFECT = 'TYPED_EFFECT',
    TRANSFER_EFFECT = 'TRANSFER_EFFECT',
}

export enum BlendUpgradeRequirementType {
    TEMPLATE_REQUIREMENT = 'TEMPLATE_REQUIREMENT',
    TYPED_ATTRIBUTE_REQUIREMENT = 'TYPED_ATTRIBUTE_REQUIREMENT'
}

export enum BlendUpgradeResultValueType {
    VALUE_ROLL_RESULT = 'VALUE_ROLL_RESULT',
    IMMEDIATE_VALUE= 'IMMEDIATE_VALUE',
}

export enum BlendUpgradeImmediateType {
    STRING = 'string',
    UINT64 = 'uint64'
}

export enum BlendsUpdatePriority {
    TABLE_BLENDS = BLENDS_BASE_PRIORITY + 10,
    SET_ROLLS = BLENDS_BASE_PRIORITY + 20,
    TABLE_VALUEROLL = BLENDS_BASE_PRIORITY + 30,
    TABLE_CONFIG = BLENDS_BASE_PRIORITY + 30,
}

const views = [
    'neftyblends_blend_details_master'
];

const functions = [
    'neftyblends_blend_details_func',
    'neftyblends_attribute_match',
];

export default class BlendsHandler extends ContractHandler {
    static handlerName = 'blends';

    declare readonly args: BlendsArgs;

    config: ConfigTableRow;

    static async setup(client: PoolClient): Promise<boolean> {
        const existsQuery = await client.query(
            'SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2)',
            ['public', 'neftyblends_blends']
        );

        if (!existsQuery.rows[0].exists) {
            logger.info('Could not find Blends tables. Creating them now...');

            await client.query(fs.readFileSync('./definitions/tables/blends_tables.sql', {
                encoding: 'utf8'
            }));

            for (const view of views) {
                await client.query(fs.readFileSync('./definitions/views/' + view + '.sql', {encoding: 'utf8'}));
            }

            for (const fn of functions) {
                await client.query(fs.readFileSync('./definitions/functions/' + fn + '.sql', {encoding: 'utf8'}));
            }

            logger.info('Blends tables successfully created');
            return true;
        }

        return false;
    }

    static async upgrade(client: PoolClient, version: string): Promise<void> {
        if (version === '1.3.18') {
            const viewsToUpdate = ['neftyblends_blend_details_master'];
            const functionsToUpdate = ['neftyblends_blend_details_func'];
            for (const view of viewsToUpdate) {
                logger.info(`Refreshing views ${view}`);
                await client.query(fs.readFileSync('./definitions/views/' + view + '.sql', {encoding: 'utf8'}));
            }
            for (const fn of functionsToUpdate) {
                logger.info(`Update function ${fn}`);
                await client.query(fs.readFileSync('./definitions/functions/' + fn + '.sql', {encoding: 'utf8'}));
            }
        }
    }

    constructor(filler: Filler, args: {[key: string]: any}) {
        super(filler, args);

        if (typeof args.atomicassets_account !== 'string') {
            throw new Error('Blends: Argument missing in helpers handler: atomicassets_account');
        }

        if (typeof args.nefty_blender_account !== 'string') {
            throw new Error('Blends: Argument missing in helpers handler: nefty_blender_account');
        }

        if (typeof args.blenderizer_account !== 'string') {
            throw new Error('Blends: Argument missing in helpers handler: blenderizer_account');
        }
    }

    async init(client: PoolClient): Promise<void> {
        try {
            await this.connection.database.begin();
            await initBlends(this.args, this.connection);
            await initSuperBlends(this.args, this.connection);

            if (this.args.store_config) {
                const configQuery = await client.query(
                    'SELECT * FROM neftyblends_config WHERE contract = $1',
                    [this.args.nefty_blender_account]
                );

                if (configQuery.rows.length === 0) {
                    const configTable = await this.connection.chain.rpc.get_table_rows({
                        json: true, code: this.args.nefty_blender_account,
                        scope: this.args.nefty_blender_account, table: 'config'
                    });

                    if (configTable.rows.length === 0) {
                        logger.warn('NeftyBlends: Unable to fetch blends config');
                        this.config = {
                            fee: 0,
                            fee_recipient: '',
                            supported_tokens: [],
                        };
                        return;
                    }

                    const config: ConfigTableRow = configTable.rows[0];

                    await client.query(
                        'INSERT INTO neftyblends_config ' +
                        '(' +
                        'contract, fee, fee_recipient) ' +
                        'VALUES ($1, $2, $3)',
                        [
                            this.args.nefty_blender_account,
                            config.fee,
                            config.fee_recipient,
                        ]
                    );

                    this.config = {
                        ...config,
                        supported_tokens: []
                    };
                } else {
                    const tokensQuery = await this.connection.database.query(
                        'SELECT * FROM neftyblends_tokens WHERE contract = $1',
                        [this.args.nefty_blender_account]
                    );

                    this.config = {
                        ...configQuery.rows[0],
                        supported_tokens: tokensQuery.rows.map(row => ({
                            contract: row.token_contract,
                            sym: row.token_precision + ',' + row.token_symbol
                        })),
                    };
                }
            }

            await this.connection.database.query('COMMIT');
        } catch (error) {
            await this.connection.database.query('ROLLBACK');
            throw error;
        }
    }

    async deleteDB(client: PoolClient): Promise<void> {
        const tables = [
            'neftyblends_blend_ingredient_attributes',
            'neftyblends_blend_ingredients',
            'neftyblends_blends',
        ];

        for (const table of tables) {
            await client.query(
                'DELETE FROM ' + client.escapeIdentifier(table) + ' WHERE assets_contract = $1',
                [this.args.atomicassets_account]
            );
        }
    }

    async register(processor: DataProcessor): Promise<() => any> {
        const destructors: Array<() => any> = [];
        destructors.push(superBlendsProcessor(this, processor));
        destructors.push(blendsProcessor(this, processor));
        if (this.args.store_config) {
            destructors.push(configProcessor(this, processor));
        }
        return (): any => destructors.map(fn => fn());
    }
}
