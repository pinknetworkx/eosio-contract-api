import { PoolClient } from 'pg';

import ConnectionManager from '../connections/manager';
import { ShipBlock } from '../types/ship';
import logger from '../utils/winston';
import { eosioTimestampToDate } from '../utils/time';
import { serializeEosioName } from '../utils/eosio';

export class ContractDB {
    constructor(readonly name: string, readonly connection: ConnectionManager) { }

    async startTransaction(currentBlock: number, lastIrreversibleBlock: number): Promise<ContractDBTransaction> {
        const client = await this.connection.database.begin();

        return new ContractDBTransaction(client, this.name, currentBlock, lastIrreversibleBlock);
    }

    async fetchAbi(contract: string, blockNum: number): Promise<{data: Uint8Array, block_num: number} | null> {
        const query = await this.connection.database.query(
            'SELECT block_num, abi FROM contract_abis WHERE account = $1 AND block_num <= $2 ORDER BY block_num DESC LIMIT 1',
            [serializeEosioName(contract), blockNum]
        );

        if (query.rows.length === 0) {
            return null;
        }

        return {
            data: query.rows[0].abi,
            block_num: parseInt(query.rows[0].block_num, 10)
        };
    }

    async fetchNextAbi(contract: string, blockNum: number): Promise<{data: Uint8Array, block_num: number} | null> {
        const query = await this.connection.database.query(
            'SELECT block_num, abi FROM contract_abis WHERE account = $1 AND block_num > $2 ORDER BY block_num ASC LIMIT 1',
            [serializeEosioName(contract), blockNum]
        );

        if (query.rows.length === 0) {
            return null;
        }

        return {
            data: query.rows[0].abi,
            block_num: parseInt(query.rows[0].block_num, 10)
        };
    }

    async getReaderPosition(): Promise<number> {
        const query = await this.connection.database.query('SELECT block_num FROM contract_readers WHERE name = $1', [this.name]);

        if (query.rows.length === 0) {
            return 0;
        }

        return parseInt(query.rows[0].block_num, 10);
    }
}

export class ContractDBTransaction {
    constructor(
        readonly client: PoolClient, readonly name: string, readonly currentBlock: number, readonly lastIrreversibleBlock: number
    ) { }

    async insert(table: string, values: object, primaryKey: string[], reversible: boolean = true) {
        if (this.currentBlock > this.lastIrreversibleBlock && reversible) {
            // TODO
        }

        let query = 'INSERT INTO ' + table + '';

        if (Array.isArray(values)) {
            if (values.length === 0 || typeof values[0] !== 'object') {
                logger.warn('ContractDB invalid insert values');

                return;
            }

            let keys = Object.keys(values[0]);

            for (const vals of values) {

            }
        } else {

        }

        query += ' RETURNING ' + primaryKey.join(', ');

        // TODO query and get primary keys / save keys to delete it later on
    }

    async update(table: string, values: object, condition: string, primaryKey: string[], reversible: boolean = true) {
        if (this.currentBlock > this.lastIrreversibleBlock && reversible ) {
            // TODO
        }
    }

    async delete(table: string, values: object, condition: string, primaryKey: string[], reversible: boolean = true) {
        if (this.currentBlock > this.lastIrreversibleBlock && reversible) {
            // TODO
        }
    }

    async replace(table: string, values: object, condition: string, primaryKey: string[], reversible: boolean = true) {
        if (this.currentBlock > this.lastIrreversibleBlock && reversible) {
            // TODO
        }

    }

    async rollbackReversibleBlocks(): Promise<void> {
        // TODO
    }

    async clearForkDatabase(): Promise<void> {
        await this.client.query(
            'DELETE FROM reversible_queries WHERE block_num <= $1',
            [this.lastIrreversibleBlock]
        );
    }

    async updateReaderPosition(block: ShipBlock): Promise<void> {
        await this.client.query(
            'UPDATE contract_readers SET block_num = $1, block_time = $2, updated = $3 WHERE name = $4',
            [block.block_num, eosioTimestampToDate(block.timestamp).getTime(), Date.now(), this.name]
        );
    }

    async commit(): Promise<void> {
        try {
            await this.client.query('COMMIT');
        } finally {
            this.client.release();
        }
    }

    async abort(): Promise<void> {
        try {
            await this.client.query('ROLLBACK');
        } finally {
            this.client.release();
        }
    }
}
