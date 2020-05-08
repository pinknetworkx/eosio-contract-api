import { PoolClient, QueryResult } from 'pg';

import ConnectionManager from '../connections/manager';
import { ShipBlock } from '../types/ship';
import { eosioTimestampToDate } from '../utils/time';
import { serializeEosioName } from '../utils/eosio';
import { arraysEqual } from '../utils';

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

    async insert(
        table: string, values: object, primaryKey: string[], reversible: boolean = true
    ): Promise<QueryResult> {
        let insertValues: {[key: string]: any}[];

        if (!Array.isArray(values)) {
            insertValues = [values];
        } else {
            insertValues = values;
        }

        if (insertValues.length === 0 || typeof insertValues[0] !== 'object') {
            throw new Error('ContractDB invalid insert values');
        }

        const keys = Object.keys(insertValues[0]);
        const queryValues = [];
        const queryRows = [];

        let varCounter = 1;

        for (const vals of insertValues) {
            if (!arraysEqual(keys, Object.keys(vals))) {
                throw new Error('Different insert keys on mass insert');
            }

            const rowVars = [];

            for (const key of keys) {
                queryValues.push(vals[key]);
                rowVars.push('$' + varCounter);
                varCounter += 1;
            }

            queryRows.push('(' + rowVars.join(', ') + ')');
        }

        let queryStr = 'INSERT INTO ' + this.client.escapeIdentifier(table) + ' ';
        queryStr += '(' + keys.map(this.client.escapeIdentifier).join(', ') + ') ';
        queryStr += 'VALUES ' + queryRows.join(', ') + ' ';

        if (primaryKey.length > 0) {
            queryStr += 'RETURNING ' + primaryKey.map(this.client.escapeIdentifier).join(', ') + ' ';
        }

        queryStr += ';';

        const query = await this.client.query(queryStr, queryValues);

        if (this.currentBlock > this.lastIrreversibleBlock && reversible) {
            const condition = query.rows.map((row) => {
                return '(' + this.buildPrimaryCondition(row, primaryKey) + ')';
            }).join(' OR ');

            await this.addRollbackQuery('delete', table, null, condition);
        }

        return query;
    }

    async update(
        table: string, values: {[key: string]: any}, condition: string, primaryKey: string[], reversible: boolean = true
    ): Promise<QueryResult> {
        let selectQuery = null;

        if (this.currentBlock > this.lastIrreversibleBlock && reversible) {
            selectQuery = await this.client.query('SELECT * FROM ' + this.client.escapeIdentifier(table) + ' WHERE ' + condition + ';');
        }

        const keys = Object.keys(values);
        const queryUpdates = [];
        const queryValues = [];

        let varCounter = 1;

        for (const key of keys) {
            queryUpdates.push('' + this.client.escapeIdentifier(key) + ' = $' + varCounter);
            queryValues.push(values[key]);
            varCounter += 1;
        }

        let queryStr = 'UPDATE ' + this.client.escapeIdentifier(table) + ' SET ';
        queryStr += queryUpdates.join(', ') + ' ';
        queryStr += 'WHERE ' + condition + ';';

        const query = await this.client.query(queryStr, queryValues);

        if (selectQuery !== null && selectQuery.rows.length > 0) {
            for (const row of selectQuery.rows) {
                await this.addRollbackQuery('update', table, row, this.buildPrimaryCondition(row, primaryKey));
            }
        }

        return query;
    }

    async delete(
        table: string, condition: string, reversible: boolean = true
    ): Promise<QueryResult> {
        let selectQuery = null;

        if (this.currentBlock > this.lastIrreversibleBlock && reversible) {
            selectQuery = await this.client.query(
                'SELECT * FROM ' + this.client.escapeIdentifier(table) + ' WHERE ' + condition + ';'
            );
        }

        const queryStr = 'DELETE FROM ' + this.client.escapeIdentifier(table) + ' WHERE ' + condition + ';';
        const query = await this.client.query(queryStr);

        if (selectQuery !== null && selectQuery.rows.length > 0) {
            await this.addRollbackQuery('insert', table, selectQuery.rows, '');
        }

        return query;
    }

    async replace(
        table: string, values: object, condition: string, primaryKey: string[], reversible: boolean = true
    ): Promise<QueryResult> {
        const selectQuery = await this.client.query('SELECT * FROM ' + this.client.escapeIdentifier(table) + ' WHERE ' + condition + ' LIMIT 1;');

        if (selectQuery.rows.length > 0) {
            await this.update(table, values, condition, primaryKey, false);

            if (this.currentBlock > this.lastIrreversibleBlock && reversible) {
                await this.addRollbackQuery(
                    'update', table, selectQuery.rows[0],
                    this.buildPrimaryCondition(selectQuery.rows[0], primaryKey)
                );
            }
        } else {
            return await this.insert(table, values, primaryKey, reversible);
        }
    }

    async addRollbackQuery(operation: string, table: string, values: object, condition: string): Promise<void> {
        await this.client.query(
            'INSERT INTO reversible_queries (operation, "table", "values", condition, block_num, reader) ' +
            'VALUES ($1, $2, $3, $4, $5, $6);',
            [operation, table, JSON.stringify(values), condition, this.currentBlock, this.name]
        );
    }

    async rollbackReversibleBlocks(blockNum: number): Promise<void> {
        const query = await this.client.query(
            'SELECT operation, "table", "values", condition ' +
            'FROM reversible_queries WHERE block_num >= $1 AND name = $2' +
            'ORDER BY block_num DESC, id DESC;',
            [blockNum, this.name]
        );

        for (const row of query.rows) {
            if (row.operation === 'insert') {
                await this.insert(row.table, JSON.parse(row.values), [], false);
            } else if (row.operation === 'update') {
                await this.update(row.table, JSON.parse(row.values), row.condition, [], false);
            } else if (row.operation === 'delete') {
                await this.delete(row.table, row.condition, false);
            } else {
                throw Error('Invalid rollback operation in database');
            }
        }

        await this.client.query(
            'DELETE FROM reversible_queries WHERE block_num >= $1 AND name = $2;',
        [blockNum, this.name]
        );
    }

    async clearForkDatabase(): Promise<void> {
        await this.client.query(
            'DELETE FROM reversible_queries WHERE block_num <= $1 AND name = $2',
            [this.lastIrreversibleBlock, this.name]
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

    private buildPrimaryCondition(values: {[key: string]: any}, primaryKey: string[]): string {
        return primaryKey.map((key) => {
            return this.client.escapeIdentifier(key) + ' = ' + this.client.escapeLiteral(values[key]);
        }).join(' AND ');
    }
}
