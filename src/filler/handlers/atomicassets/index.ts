import * as fs from 'fs';

import { ObjectSchema } from 'atomicassets';
import { ISchema } from 'atomicassets/build/Schema';

import { ContractHandler } from '../interfaces';
import { ShipBlock } from '../../../types/ship';
import { EosioActionTrace, EosioTableRow, EosioTransaction } from '../../../types/eosio';
import { ContractDBTransaction } from '../../database';
import logger from '../../../utils/winston';
import AtomicAssetsTableHandler from './tables';
import ConnectionManager from '../../../connections/manager';
import { PromiseEventHandler } from '../../../utils/event';
import AtomicAssetsActionHandler from './actions';
import { serializeEosioName } from '../../../utils/eosio';

export enum OfferState {
    PENDING = 0,
    INVALID = 1,
    UNKNOWN = 2,
    ACCEPTED = 3,
    DECLINED = 4,
    CANCELLED = 5
}

export enum OfferAssetState {
    NORMAL = 0,
    MISSING = 1
}

export type AtomicAssetsArgs = {
    atomicassets_account: string
};

export default class AtomicAssetsHandler extends ContractHandler {
    static handlerName = 'atomicassets';

    readonly args: AtomicAssetsArgs;

    config: {
        version: string,
        collection_format?: ISchema
    };

    tableHandler: AtomicAssetsTableHandler;
    actionHandler: AtomicAssetsActionHandler;

    constructor(connection: ConnectionManager, events: PromiseEventHandler, args: {[key: string]: any}) {
        if (typeof args.atomicassets_account !== 'string') {
            throw new Error('Argument missing in atomicassets handler: atomicassets_account');
        }

        super(connection, events, args);

        this.scope = {
            actions: [
                {
                    filter: this.args.atomicassets_account + ':*',
                    deserialize: true
                }
            ],
            tables: [
                {
                    filter: this.args.atomicassets_account + ':*',
                    deserialize: true
                }
            ]
        };

        this.config = {
            version: '0.0.0',
            collection_format: undefined
        };

        this.tableHandler = new AtomicAssetsTableHandler(this);
        this.actionHandler = new AtomicAssetsActionHandler(this);
    }

    async init(): Promise<void> {
        let query = null;

        try {
            query = await this.connection.database.query(
                'SELECT * FROM atomicassets_config WHERE contract = $1',
                [serializeEosioName(this.args.atomicassets_account)]
            );
        } catch (e) {
            logger.info('Could not find AtomicAssets tables. Create them now...');

            await this.connection.database.query(fs.readFileSync('./definitions/atomicassets_tables.sql', {
                encoding: 'utf8'
            }));

            logger.info('AtomicAssets tables successfully created');
        }

        if (query === null || query.rows.length === 0) {
            const configTable = await this.connection.chain.rpc.get_table_rows({
                json: true, code: this.args.atomicassets_account,
                scope: this.args.atomicassets_account, table: 'config'
            });

            const tokenTable = await this.connection.chain.rpc.get_table_rows({
                json: true, code: this.args.atomicassets_account,
                scope: this.args.atomicassets_account, table: 'tokenconfigs'
            });

            if (configTable.rows.length > 0 && tokenTable.rows.length > 0 && tokenTable.rows[0].standard === 'atomicassets') {
                await this.connection.database.query(
                    'INSERT INTO atomicassets_config (contract, version, collection_format) VALUES ($1, $2, $3)',
                    [
                        serializeEosioName(this.args.atomicassets_account),
                        tokenTable.rows[0].version,
                        configTable.rows[0].collection_format.map((element: any) => JSON.stringify(element))
                    ]
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
                    [this.args.atomicassets_account]
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
