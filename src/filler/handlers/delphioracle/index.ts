import * as fs from 'fs';
import { PoolClient } from 'pg';

import { ContractHandler } from '../interfaces';
import { ShipBlock } from '../../../types/ship';
import { EosioTableRow } from '../../../types/eosio';
import { ContractDBTransaction } from '../../database';
import logger from '../../../utils/winston';
import { eosioTimestampToDate } from '../../../utils/eosio';
import Filler from '../../filler';
import DataProcessor from '../../processor';

export type DelphiOracleArgs = {
    delphioracle_account: string
};

type PairsTableRow = {
    active: number,
    bounty_awarded: number,
    bounty_edited_by_custodians: number,
    proposer: string,
    name: string,
    bounty_amount: string,
    approving_custodians: string[],
    approving_oracles: string[],
    base_symbol: string,
    base_type: 4,
    base_contract: string,
    quote_symbol: string,
    quote_type: number,
    quote_contract: string,
    quoted_precision: number
};

type DatapointsTableRow = {
    id: string,
    owner: string,
    value: string,
    median: string,
    timestamp: string
};

export default class DelphiOracleHandler extends ContractHandler {
    static handlerName = 'delphioracle';

    readonly args: DelphiOracleArgs;

    config: {
        version: string
    };

    pairs: string[] = [];

    constructor(filler: Filler, args: {[key: string]: any}) {
        super(filler, args);

        if (typeof args.delphioracle_account !== 'string') {
            throw new Error('DelphiOracle: Argument missing in handler: delphioracle_account');
        }
    }

    async init(client: PoolClient): Promise<void> {
        const existsQuery = await client.query(
            'SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2)',
            [await this.connection.database.schema(), 'delphioracle_pairs']
        );

        if (!existsQuery.rows[0].exists) {
            logger.info('Could not find DelphiOracle tables. Create them now...');

            await client.query(fs.readFileSync('./definitions/tables/delphioracle_tables.sql', {
                encoding: 'utf8'
            }));

            logger.info('DelphiOracle tables successfully created');

            const resp = await this.connection.chain.rpc.get_table_rows({
                json: true, code: this.args.delphioracle_account, scope: this.args.delphioracle_account,
                table: 'pairs', limit: 100
            });

            const createdPairs = [];

            for (const row of resp.rows) {
                const data = this.getDatabaseRow(row);
                const keys = Object.keys(data);

                await client.query(
                    'INSERT INTO delphioracle_pairs (' +
                    keys.map((key) => client.escapeIdentifier(key)).join(',') +
                    ') VALUES (' +
                    keys.map((_, index) => '$' + (index + 1)).join(',') +
                    ')',
                    keys.map(key => data[key])
                );

                createdPairs.push(row.name);
            }

            logger.info('Successfully created ' + createdPairs.length + ' delphi pairs on first run', createdPairs);
        }
    }

    async deleteDB(client: PoolClient): Promise<void> {
        const tables = ['delphioracle_pairs'];

        for (const table of tables) {
            await client.query(
                'DELETE FROM ' + client.escapeIdentifier(table) + ' WHERE contract = $1',
                [this.args.delphioracle_account]
            );
        }
    }

    async register(processor: DataProcessor): Promise<() => any> {
        const destructors: Array<() => any> = [];

        const lastUpdated: {[key: string]: number} = {};

        destructors.push(
            processor.onDelta(this.args.delphioracle_account, 'datapoints', async (db: ContractDBTransaction, block: ShipBlock, delta: EosioTableRow<DatapointsTableRow>) => {
                if (!lastUpdated[delta.scope]) {
                    const existsQuery = await this.connection.database.query(
                        'SELECT delphi_pair_name FROM delphioracle_pairs WHERE contract = $1 AND delphi_pair_name = $2',
                        [this.args.delphioracle_account, delta.scope]
                    );

                    if (existsQuery.rowCount === 0) {
                        await this.fillPair(db, block, delta.scope);
                    }

                    lastUpdated[delta.scope] = 0;
                }

                if (lastUpdated[delta.scope] + 30 < block.block_num) {
                    await db.update('delphioracle_pairs', {
                        median: delta.value.median,
                        updated_at_time: eosioTimestampToDate(block.timestamp).getTime(),
                        updated_at_block: block.block_num
                    }, {
                        str: 'contract = $1 AND delphi_pair_name = $2',
                        values: [this.args.delphioracle_account, delta.scope]
                    }, ['contract', 'delphi_pair_name']);

                    lastUpdated[delta.scope] = block.block_num;
                }

            }, 100, {headOnly: true})
        );

        destructors.push(
            processor.onDelta(this.args.delphioracle_account, 'pairs', async (db: ContractDBTransaction, block: ShipBlock, delta: EosioTableRow<PairsTableRow>) => {
                await this.savePair(db, block, delta.value);
            }, 100, {headOnly: true})
        );


        return (): any => destructors.map(fn => fn());
    }

    private async fillPair(db: ContractDBTransaction, block: ShipBlock, pair: string): Promise<void> {
        const resp = await this.connection.chain.rpc.get_table_rows({
            json: true, code: this.args.delphioracle_account, scope: this.args.delphioracle_account,
            table: 'pairs', lower_bound: pair, upper_bound: pair
        });

        if (resp.rows.length === 0) {
            throw new Error('DelphiOracle: Delphi pair not found');
        }

        await this.savePair(db, block, resp.rows[0]);
    }

    private async savePair(db: ContractDBTransaction, _: ShipBlock, row: PairsTableRow): Promise<void> {
        if (this.pairs.indexOf(row.name) >= 0) {
            return;
        }

        this.pairs.push(row.name);

        await db.replace('delphioracle_pairs', this.getDatabaseRow(row), ['contract', 'delphi_pair_name'], ['median']);
    }

    private getDatabaseRow(table: PairsTableRow): any {
        return {
            contract: this.args.delphioracle_account,
            delphi_pair_name: table.name,
            base_symbol: table.base_symbol.split(',')[1],
            base_precision: table.base_symbol.split(',')[0],
            quote_symbol: table.quote_symbol.split(',')[1],
            quote_precision: table.quote_symbol.split(',')[0],
            median: 1, // should not be 0
            median_precision: table.quoted_precision,
            updated_at_time: 0,
            updated_at_block: 0
        };
    }
}
