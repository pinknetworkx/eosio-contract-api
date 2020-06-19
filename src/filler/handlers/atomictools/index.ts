import * as fs from 'fs';
import { PoolClient } from 'pg';

import { ContractHandler } from '../interfaces';
import { ShipBlock } from '../../../types/ship';
import { EosioActionTrace, EosioTableRow, EosioTransaction } from '../../../types/eosio';
import { ContractDBTransaction } from '../../database';
import logger from '../../../utils/winston';
import StateReceiver from '../../receiver';
import { ConfigTableRow } from './types/tables';
import { getStackTrace } from '../../../utils';
import AtomicToolsTableHandler from './tables';
import AtomicToolsActionHandler from './actions';

export type AtomicToolsArgs = {
    atomictools_account: string,
    atomicassets_account: string
};

export enum JobPriority {
    TABLE_CONFIG = 90,
    ACTION_CREATE_LINK = 80,
    TABLE_LINKS = 70,
    ACTION_UPDATE_LINK = 50
}

export enum LinkState {
    WAITING = 0,
    CREATED = 1,
    CANCELED = 2,
    CLAIMED = 3
}

export default class AtomicToolsHandler extends ContractHandler {
    static handlerName = 'atomictools';

    readonly args: AtomicToolsArgs;

    config: ConfigTableRow;

    jobs: Array<{
        priority: number,
        index: number,
        trace: any,
        fn: () => any
    }> = [];

    tableHandler: AtomicToolsTableHandler;
    actionHandler: AtomicToolsActionHandler;

    constructor(reader: StateReceiver, args: {[key: string]: any}, minBlock: number = 0) {
        super(reader, args, minBlock);

        if (typeof this.args.atomictools_account !== 'string') {
            throw new Error('AtomicTools: Argument missing in handler: atomictools_account');
        }

        this.scope = {
            actions: [
                {
                    filter: this.args.atomictools_account + ':*',
                    deserialize: true
                }
            ],
            tables: [
                {
                    filter: this.args.atomictools_account + ':*',
                    deserialize: true
                }
            ]
        };

        this.tableHandler = new AtomicToolsTableHandler(this);
        this.actionHandler = new AtomicToolsActionHandler(this);
    }

    async init(client: PoolClient): Promise<void> {
        const existsQuery = await client.query(
            'SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2)',
            [await this.connection.database.schema(), 'atomictools_config']
        );

        if (!existsQuery.rows[0].exists) {
            logger.info('Could not find AtomicTools tables. Create them now...');

            await client.query(fs.readFileSync('./definitions/tables/atomictools_tables.sql', {
                encoding: 'utf8'
            }));

            logger.info('AtomicTools tables successfully created');
        }

        const configQuery = await client.query(
            'SELECT * FROM atomictools_config WHERE tools_contract = $1',
            [this.args.atomictools_account]
        );

        if (configQuery.rows.length === 0) {
            const configTable = await this.connection.chain.rpc.get_table_rows({
                json: true, code: this.args.atomictools_account,
                scope: this.args.atomictools_account, table: 'config'
            });

            if (configTable.rows.length === 0) {
                throw new Error('AtomicTools: Unable to fetch atomictools version');
            }

            const config: ConfigTableRow = configTable.rows[0];

            this.args.atomicassets_account = config.atomicassets_account;

            await client.query(
                'INSERT INTO atomictools_config ' +
                '(tools_contract, asset_contract, version) VALUES ($1, $2, $3)',
                [this.args.atomictools_account, this.args.atomicassets_account, config.version]
            );

            this.config = {...config};
        } else {
            this.args.atomicassets_account = configQuery.rows[0].asset_contract;

            this.config = {
                ...configQuery.rows[0],
                link_counter: 0,
                atomicassets_account: this.args.atomicassets_account
            };
        }
    }

    async deleteDB(client: PoolClient): Promise<void> {
        const tables = ['atomictools_links', 'atomictools_links_assets', 'atomictools_config'];

        for (const table of tables) {
            await client.query(
                'DELETE FROM ' + client.escapeIdentifier(table) + ' WHERE tools_contract = $1',
                [this.args.atomictools_account]
            );
        }
    }

    async onTableChange(db: ContractDBTransaction, block: ShipBlock, delta: EosioTableRow): Promise<void> {
        await this.tableHandler.handleUpdate(db, block, delta);
    }

    async onAction(db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace, tx: EosioTransaction): Promise<void> {
        await this.actionHandler.handleTrace(db, block, trace, tx);
    }

    async onBlockStart(): Promise<void> {
        this.jobs = [];
    }

    async onBlockComplete(): Promise<void> {
        this.jobs.sort((a, b) => {
            if (a.priority === b.priority) {
                return a.index - b.index;
            }

            return b.priority - a.priority;
        });

        for (const job of this.jobs) {
            try {
                await job.fn();
            } catch (e) {
                logger.error('Error while processing update job', job.trace);

                throw e;
            }
        }

        this.jobs = [];
    }

    async onCommit(): Promise<void> { }

    addUpdateJob(fn: () => any, priority: JobPriority): void {
        this.jobs.push({
            priority: priority.valueOf(),
            index: this.jobs.length,
            trace: getStackTrace(),
            fn: fn
        });
    }
}
