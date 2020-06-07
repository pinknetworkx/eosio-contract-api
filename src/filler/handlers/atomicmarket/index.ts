import * as fs from 'fs';
import { PoolClient } from 'pg';

import { ContractHandler } from '../interfaces';
import { ShipBlock } from '../../../types/ship';
import { EosioActionTrace, EosioTableRow, EosioTransaction } from '../../../types/eosio';
import { ContractDBTransaction } from '../../database';
import ConnectionManager from '../../../connections/manager';
import { PromiseEventHandler } from '../../../utils/event';
import logger from '../../../utils/winston';

export type AtomicMarketArgs = {
    atomicassets_account: string,
    atomicmarket_account: string
};

export default class AtomicAssetsHandler extends ContractHandler {
    static handlerName = 'atomicmarket';

    readonly args: AtomicMarketArgs;

    constructor(connection: ConnectionManager, events: PromiseEventHandler, args: {[key: string]: any}) {
        if (typeof args.atomicassets_account !== 'string') {
            throw new Error('Argument missing in atomicmarket handler: atomicassets_account');
        }

        if (typeof args.atomicmarket_account !== 'string') {
            throw new Error('Argument missing in atomicmarket handler: atomicmarket_account');
        }

        super(connection, events, args);

        this.scope = {
            actions: [
                {
                    filter: this.args.atomicmarket_account + ':*',
                    deserialize: true
                }
            ],
            tables: [
                {
                    filter: this.args.atomicmarket_account + ':*',
                    deserialize: true
                }
            ]
        };
    }

    async init(): Promise<void> {
        try {
            await this.connection.database.query(
                'SELECT * FROM atomicmarket_config WHERE market_contract = $1',
                [this.args.atomicmarket_account]
            );
        } catch (e) {
            logger.info('Could not find AtomicMarket tables. Create them now...');

            await this.connection.database.query(fs.readFileSync('./definitions/tables/atomicmarket_tables.sql', {
                encoding: 'utf8'
            }));

            logger.info('AtomicMarket tables successfully created');
        }
    }

    async deleteDB(client: PoolClient): Promise<void> {
        const tables = [
            'atomicmarket_auctions', 'atomicmarket_auctions_bids', 'atomicmarket_config',
            'atomicmarket_delphi_pairs', 'atomicmarket_marketplaces', 'atomicmarket_sales',
            'atomicmarket_token_symbols'
        ];

        for (const table of tables) {
            await client.query(
                'DELETE FROM ' + client.escapeIdentifier(table) + ' WHERE marketcontract = $1',
                [this.args.atomicmarket_account]
            );
        }
    }

    async onAction(_db: ContractDBTransaction, _block: ShipBlock, _trace: EosioActionTrace, _tx: EosioTransaction): Promise<void> {

    }

    async onTableChange(_db: ContractDBTransaction, _block: ShipBlock, _delta: EosioTableRow): Promise<void> {

    }

    async onBlockComplete(_db: ContractDBTransaction, _block: ShipBlock): Promise<void> {

    }

    async onCommit(): Promise<void> {

    }
}
