import * as fs from 'fs';
import { PoolClient } from 'pg';

import { ContractHandler } from '../interfaces';
import logger from '../../../utils/winston';
import { ConfigTableRow } from './types/tables';
import Filler from '../../filler';
import { DELPHIORACLE_BASE_PRIORITY } from '../delphioracle';
import { ATOMICASSETS_BASE_PRIORITY } from '../atomicassets';
import DataProcessor from '../../processor';
import { balanceProcessor } from './processors/balances';
import { configProcessor } from './processors/config';
import { dropsProcessor } from './processors/drops';

export const NEFTYDROPS_BASE_PRIORITY = Math.max(ATOMICASSETS_BASE_PRIORITY, DELPHIORACLE_BASE_PRIORITY) + 1000;

export type NeftyDropsArgs = {
    neftydrops_account: string,
    atomicassets_account: string,
    delphioracle_account: string
};

export enum DropState {
    ACTIVE = 0,
    DELETED = 1
}

export enum NeftyDropsUpdatePriority {
    TABLE_BALANCES = NEFTYDROPS_BASE_PRIORITY + 10,
    TABLE_CONFIG = NEFTYDROPS_BASE_PRIORITY + 10,
    ACTION_CREATE_DROP = NEFTYDROPS_BASE_PRIORITY + 20,
    ACTION_UPDATE_DROP = NEFTYDROPS_BASE_PRIORITY + 20,
    ACTION_CLAIM_DROP = NEFTYDROPS_BASE_PRIORITY + 40,
}

const views = ['neftydrops_stats_master', 'neftydrops_drop_prices_master', 'neftydrops_drops_master'];
const materializedViews = ['neftydrops_stats', 'neftydrops_drop_prices'];
const procedures: string[] = [];

export default class NeftyDropsHandler extends ContractHandler {
    static handlerName = 'neftydrops';

    readonly args: NeftyDropsArgs;

    config: ConfigTableRow;

    static async setup(client: PoolClient): Promise<boolean> {
        const existsQuery = await client.query(
            'SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2)',
            ['public', 'neftydrops_config']
        );

        if (!existsQuery.rows[0].exists) {
            logger.info('Could not find NeftyDrops tables. Create them now...');

            await client.query(fs.readFileSync('./definitions/tables/neftydrops_tables.sql', {
                encoding: 'utf8'
            }));

            for (const view of views) {
                await client.query(fs.readFileSync('./definitions/views/' + view + '.sql', {encoding: 'utf8'}));
            }

            for (const view of materializedViews) {
                await client.query(fs.readFileSync('./definitions/materialized/' + view + '.sql', {encoding: 'utf8'}));
            }

            for (const procedure of procedures) {
                await client.query(fs.readFileSync('./definitions/procedures/' + procedure + '.sql', {encoding: 'utf8'}));
            }

            logger.info('NeftyDrops tables successfully created');

            return true;
        }

        return false;
    }

    static async upgrade(client: PoolClient, version: string): Promise<void> {
        // No upgrade necessary
    }

    constructor(filler: Filler, args: {[key: string]: any}) {
        super(filler, args);

        if (typeof args.neftydrops_account !== 'string') {
            throw new Error('NeftyDrops: Argument missing in neftydrops handler: neftydrops_account');
        }
    }

    async init(client: PoolClient): Promise<void> {
        const configQuery = await client.query(
            'SELECT * FROM neftydrops_config WHERE drops_contract = $1',
            [this.args.neftydrops_account]
        );

        if (configQuery.rows.length === 0) {
            const configTable = await this.connection.chain.rpc.get_table_rows({
                json: true, code: this.args.neftydrops_account,
                scope: this.args.neftydrops_account, table: 'config'
            });

            if (configTable.rows.length === 0) {
                throw new Error('NeftyDrops: Unable to fetch neftydrops version');
            }

            const config: ConfigTableRow = configTable.rows[0];

            this.args.delphioracle_account = config.delphioracle_account;
            this.args.atomicassets_account = config.atomicassets_account;

            await client.query(
                'INSERT INTO neftydrops_config ' +
                '(' +
                    'drops_contract, assets_contract, delphi_contract, ' +
                    'version, drop_fee, drop_fee_recipient ' +
                ') ' +
                'VALUES ($1, $2, $3, $4, $5, $6)',
                [
                    this.args.neftydrops_account,
                    this.args.atomicassets_account,
                    config.delphioracle_account,
                    config.version,
                    config.drop_fee,
                    config.drop_fee_recipient
                ]
            );

            this.config = {
                ...config,
                supported_symbol_pairs: [],
                supported_tokens: []
            };
        } else {
            this.args.delphioracle_account = configQuery.rows[0].delphi_contract;
            this.args.atomicassets_account = configQuery.rows[0].assets_contract;

            const tokensQuery = await this.connection.database.query(
                'SELECT * FROM neftydrops_tokens WHERE drops_contract = $1',
                [this.args.neftydrops_account]
            );

            const pairsQuery = await this.connection.database.query(
                'SELECT * FROM neftydrops_symbol_pairs WHERE drops_contract = $1',
                [this.args.neftydrops_account]
            );

            this.config = {
                ...configQuery.rows[0],
                supported_symbol_pairs: pairsQuery.rows.map(row => ({
                    listing_symbol: 'X,' + row.listing_symbol,
                    settlement_symbol: 'X,' + row.settlement_symbol,
                    invert_delphi_pair: row.invert_delphi_pair,
                    delphi_pair_name: row.delphi_pair_name
                })),
                supported_tokens: tokensQuery.rows.map(row => ({
                    token_contract: row.token_contract,
                    token_symbol: row.token_precision + ',' + row.token_symbol
                })),
                delphioracle_account: this.args.delphioracle_account,
                atomicassets_account: this.args.atomicassets_account
            };
        }
    }

    async deleteDB(client: PoolClient): Promise<void> {
        const tables = [
            'neftydrops_drops', 'neftydrops_claims', 'neftydrops_balances',
            'neftydrops_tokens', 'neftydrops_symbol_pairs', 'neftydrops_config'
        ];

        for (const table of tables) {
            await client.query(
                'DELETE FROM ' + client.escapeIdentifier(table) + ' WHERE drops_contract = $1',
                [this.args.neftydrops_account]
            );
        }

        for (const view of materializedViews) {
            await client.query('REFRESH MATERIALIZED VIEW ' + client.escapeIdentifier(view) + '');
        }
    }

    async register(processor: DataProcessor): Promise<() => any> {
        const destructors: Array<() => any> = [];

        destructors.push(configProcessor(this, processor));
        destructors.push(balanceProcessor(this, processor));
        destructors.push(dropsProcessor(this, processor));

        for (const view of materializedViews) {
            destructors.push(this.filler.registerUpdateJob(async () => {
                await this.connection.database.query('REFRESH MATERIALIZED VIEW CONCURRENTLY ' + view + ';');
            }, 60000, false));
        }

        return (): any => destructors.map(fn => fn());
    }
}
