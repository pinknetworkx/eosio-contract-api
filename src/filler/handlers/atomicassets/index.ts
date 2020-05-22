import * as fs from 'fs';
import PQueue from 'p-queue';

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
import { getStackTrace } from '../../../utils';

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

export enum JobPriority {
    INDEPENDENT = 100,
    TABLE_BALANCES = 90,
    TABLE_CONFIG = 90,
    TABLE_TOKENCONFIGS = 90,
    TABLE_COLLECTIONS = 80,
    TABLE_SCHEMES = 80,
    TABLE_PRESETS = 50,
    TABLE_ASSETS = 50,
    ACTION_BURN_ASSET = 40,
    ACTION_TRANSFER_ASSET = 30,
    TABLE_OFFERS = 20,
    ACTION_CREATE_OFFER = 10,
    ACTION_UPDATE_OFFER = 0
}

export type AtomicAssetsReaderArgs = {
    atomicassets_account: string
};

export default class AtomicAssetsHandler extends ContractHandler {
    static handlerName = 'atomicassets';

    readonly args: AtomicAssetsReaderArgs;

    config: {
        version: string,
        collection_format?: ISchema
    };

    queue: PQueue;
    jobs: any[] = [];

    tableHandler: AtomicAssetsTableHandler;
    actionHandler: AtomicAssetsActionHandler;

    constructor(connection: ConnectionManager, events: PromiseEventHandler, args: {[key: string]: any}) {
        super(connection, events, args);

        if (typeof args.atomicassets_account !== 'string') {
            throw new Error('Argument missing in atomicassets handler: atomicassets_account');
        }

        this.queue = new PQueue({concurrency: 1, autoStart: false});
        this.queue.pause();

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
                [this.args.atomicassets_account]
            );
        } catch (e) {
            logger.info('Could not find AtomicAssets tables. Create them now...');

            await this.connection.database.query(fs.readFileSync('./definitions/tables/atomicassets_tables.sql', {
                encoding: 'utf8'
            }));

            logger.info('AtomicAssets tables successfully created');
        }

        await this.connection.database.query(
            fs.readFileSync('./definitions/views/atomicassets_assets_master.sql', {encoding: 'utf8'})
        );
        await this.connection.database.query(
            fs.readFileSync('./definitions/views/atomicassets_templates_master.sql', {encoding: 'utf8'})
        );
        await this.connection.database.query(
            fs.readFileSync('./definitions/views/atomicassets_schemas_master.sql', {encoding: 'utf8'})
        );
        await this.connection.database.query(
            fs.readFileSync('./definitions/views/atomicassets_collections_master.sql', {encoding: 'utf8'})
        );
        await this.connection.database.query(
            fs.readFileSync('./definitions/views/atomicassets_offers_master.sql', {encoding: 'utf8'})
        );
        await this.connection.database.query(
            fs.readFileSync('./definitions/views/atomicassets_transfers_master.sql', {encoding: 'utf8'})
        );

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
                        this.args.atomicassets_account,
                        tokenTable.rows[0].version,
                        configTable.rows[0].collection_format.map((element: any) => JSON.stringify(element))
                    ]
                );

                this.config.collection_format = ObjectSchema(configTable.rows[0].collection_format);
                this.config.version = tokenTable.rows[0].version;
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
                'atomicassets_templates', 'atomicassets_templates_data', 'atomicassets_schemas',
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

    async onBlockComplete(): Promise<void> {
        this.queue.start();
        await Promise.all(this.jobs);
        this.queue.pause();
        this.jobs = [];
    }

    addJob(fn: () => any, priority: number): void {
        const trace = getStackTrace();

        this.jobs.push(this.queue.add(async () => {
            try {
                await fn();
            } catch (e) {
                logger.error(trace);
            }
        }, {priority}));
    }
}
