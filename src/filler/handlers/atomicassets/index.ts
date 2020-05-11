import * as fs from 'fs';

import { ObjectSchema } from 'atomicassets';
import { ISchema } from 'atomicassets/build/Schema';

import { ContractHandler } from '../index';
import { ShipBlock } from '../../../types/ship';
import { EosioActionTrace, EosioTableRow, EosioTransaction } from '../../../types/eosio';
import { ContractDBTransaction } from '../../database';
import logger from '../../../utils/winston';
import AtomicAssetsTableHandler from './tables';
import ConnectionManager from '../../../connections/manager';
import { PromiseEventHandler } from '../../../utils/event';
import AtomicAssetsActionHandler from './actions';

export enum OfferState {
    PENDING = 0,
    INVALID = 1,
    ACCEPTED = 3,
    DECLINED = 4,
    CANCELLED = 5
}

export type AtomicAssetsArgs = {
    atomicassets_contract: string
};

export default class AtomicAssetsHandler extends ContractHandler {
    static handlerName = 'atomicassets';

    readonly args: AtomicAssetsArgs;

    config: {
        version: string,
        collection_format: ISchema
    };

    tableHandler: AtomicAssetsTableHandler;
    actionHandler: AtomicAssetsActionHandler;

    constructor(connection: ConnectionManager, events: PromiseEventHandler, args: {[key: string]: any}) {
        super(connection, events, args);

        this.tableHandler = new AtomicAssetsTableHandler(this);
        this.actionHandler = new AtomicAssetsActionHandler(this);
    }

    async init(): Promise<void> {
        let query = null;

        try {
            query = await this.connection.database.query(
                'SELECT * FROM atomicassets_config LIMIT WHERE contract = $1',
                [this.args.atomicassets_contract]
            );
        } catch (e) {
            logger.info('Could not find AtomicAssets tables. Create them now...');

            await this.connection.database.query(fs.readFileSync('./definitions/atomicassets_tables.sql', {
                encoding: 'utf8'
            }));

            logger.info('AtomicAssets tables successfully created');
        }

        if (query === null || query.rows.length === 0) {
            const table = await this.connection.chain.rpc.get_table_rows({
                json: true, code: this.args.atomicassets_contract,
                scope: this.args.atomicassets_contract, table: 'config'
            });

            if (table.rows.length > 0) {
                await this.connection.database.query(
                    'INSERT INTO atomicassets_config (contract, version, collection_format) VALUES ($1, $2, $3)',
                    [this.args.atomicassets_contract, table.rows[0].version, table.rows[0].collection_format]
                );
            } else {
                throw new Error('Unable to fetch atomicassets version');
            }
        } else {
            this.config.collection_format = ObjectSchema(query.rows[0].collection_format);
            this.config.version = query.rows[0].version;
        }
    }

    async deleteDB(): Promise<void> {
        const client = await this.connection.database.begin();

        try {
            const tables = [
                'atomicassets_assets', 'atomicassets_assets_backed_tokens', 'atomicassets_assets_data',
                'atomicassets_balances', 'atomicassets_collections', 'atomicassets_config',
                'atomicassets_logs', 'atomicassets_offers', 'atomicassets_offers_assets',
                'atomicassets_presets', 'atomicassets_presets_data', 'atomicassets_schemes',
                'atomicassets_token_symbols', 'atomicassets_transfers', 'atomicassets_transfers_assets'
            ];

            for (const table of tables) {
                await client.query(
                    'DELETE FROM ' + client.escapeIdentifier(table) + ' WHERE contract = $1',
                    [this.args.atomicassets_contract]
                );
            }

            await client.query('COMMIT');
        } finally {
            client.release();
        }
    }

    async onAction(db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace, tx: EosioTransaction): Promise<void> {
        await this.actionHandler.handleTrace(db, block, trace, tx);
    }

    async onTableChange(db: ContractDBTransaction, block: ShipBlock, delta: EosioTableRow): Promise<void> {
        await this.tableHandler.handleUpdate(db, block, delta);
    }
}
