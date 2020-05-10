import { PoolClient, QueryResult } from 'pg';
import AwaitLock from 'await-lock';

import ConnectionManager from '../connections/manager';
import { ShipBlock } from '../types/ship';
import { eosioTimestampToDate, serializeEosioName } from '../utils/eosio';
import { arraysEqual } from '../utils';

export type Condition = {
    str: string,
    values: any[]
};

type SerializedValue = {
    type: string,
    data: any
};

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
    readonly lock: AwaitLock;

    constructor(
        readonly client: PoolClient, readonly name: string, readonly currentBlock: number, readonly lastIrreversibleBlock: number
    ) {
        this.lock = new AwaitLock();
    }

    async query(queryStr: string, values: any[] = [], lock: boolean = true): Promise<QueryResult> {
        await this.acquireLock(lock);

        try {
            return await this.client.query(queryStr, values);
        } finally {
            this.releaseLock(lock);
        }
    }

    async insert(
        table: string, values: object, primaryKey: string[], reversible: boolean = true, lock: boolean = true
    ): Promise<QueryResult> {
        await this.acquireLock(lock);

        try {
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
                const condition: Condition = {
                    str: '',
                    values: []
                };

                condition.str = query.rows.map((row) => {
                    const primaryCondition = this.buildPrimaryCondition(row, primaryKey, condition.values.length);
                    condition.values = condition.values.concat(primaryCondition.values);

                    return '(' + primaryCondition.str + ')';
                }).join(' OR ');

                await this.addRollbackQuery('delete', table, null, condition);
            }

            return query;
        } finally {
            this.releaseLock(lock);
        }
    }

    async update(
        table: string, values: {[key: string]: any}, condition: Condition,
        primaryKey: string[], reversible: boolean = true, lock: boolean = true
    ): Promise<QueryResult> {
        await this.acquireLock(lock);

        try {
            let selectQuery = null;

            if (this.currentBlock > this.lastIrreversibleBlock && reversible) {
                selectQuery = await this.client.query(
                    'SELECT * FROM ' + this.client.escapeIdentifier(table) + ' WHERE ' + condition.str + ';', condition.values
                );
            }

            const keys = Object.keys(values);
            const queryUpdates = [];

            let queryValues = [];
            let varCounter = 0;

            for (const key of keys) {
                varCounter += 1;
                queryUpdates.push('' + this.client.escapeIdentifier(key) + ' = $' + varCounter);
                queryValues.push(values[key]);
            }

            let queryStr = 'UPDATE ' + this.client.escapeIdentifier(table) + ' SET ';
            queryStr += queryUpdates.join(', ') + ' ';
            queryStr += 'WHERE ' + this.changeQueryVarOffset(condition.str, condition.values.length, varCounter) + ';';

            queryValues = queryValues.concat(condition.values);

            const query = await this.client.query(queryStr, queryValues);

            if (selectQuery !== null && selectQuery.rows.length > 0) {
                for (const row of selectQuery.rows) {
                    const filteredValues = this.removeIdenticalValues(row, values, primaryKey);

                    if (Object.keys(filteredValues).length === 0) {
                        continue;
                    }

                    await this.addRollbackQuery('update', table, filteredValues, this.buildPrimaryCondition(row, primaryKey));
                }
            }

            return query;
        } finally {
            this.releaseLock(lock);
        }
    }

    async delete(
        table: string, condition: Condition, reversible: boolean = true, lock: boolean = true
    ): Promise<QueryResult> {
        await this.acquireLock(lock);

        try {
            let selectQuery = null;

            if (this.currentBlock > this.lastIrreversibleBlock && reversible) {
                selectQuery = await this.client.query(
                    'SELECT * FROM ' + this.client.escapeIdentifier(table) + ' WHERE ' + condition.str + ';', condition.values
                );
            }

            const queryStr = 'DELETE FROM ' + this.client.escapeIdentifier(table) + ' WHERE ' + condition.str + ';';
            const query = await this.client.query(queryStr, condition.values);

            if (selectQuery !== null && selectQuery.rows.length > 0) {
                await this.addRollbackQuery('insert', table, selectQuery.rows, null);
            }

            return query;
        } finally {
            this.releaseLock(lock);
        }
    }

    async replace(
        table: string, values: object, primaryKey: string[], updateBlacklist: string[] = [],
        reversible: boolean = true, lock: boolean = true
    ): Promise<QueryResult> {
        await this.acquireLock(lock);

        try {
            const condition = this.buildPrimaryCondition(values, primaryKey);
            const selectQuery = await this.client.query(
                'SELECT * FROM ' + this.client.escapeIdentifier(table) + ' WHERE ' + condition.str + ' LIMIT 1;', condition.values
            );

            if (selectQuery.rows.length > 0) {
                const updateValues: {[key: string]: any} = {...values};

                for (const key of updateBlacklist) {
                    delete updateValues[key];
                }

                await this.update(table, updateValues, condition, primaryKey, false, false);

                if (this.currentBlock > this.lastIrreversibleBlock && reversible) {
                    const filteredValues = this.removeIdenticalValues(selectQuery.rows[0], updateValues, primaryKey);

                    if (Object.keys(filteredValues).length > 0) {
                        await this.addRollbackQuery('update', table, filteredValues, condition);
                    }
                }
            } else {
                return await this.insert(table, values, primaryKey, reversible, false);
            }
        } finally {
            this.releaseLock(lock);
        }
    }

    async addRollbackQuery(operation: string, table: string, values: any, condition: Condition | null): Promise<void> {
        let serializedCondition = null;
        if (condition) {
            serializedCondition = {
                str: condition.str,
                values: condition.values.map((value) => this.serializeValue(value))
            };
        }

        let serializedValues: any = null;
        if (Array.isArray(values)) {
            serializedValues = [];

            for (const value of values) {
                const row = {...value};

                for (const key of Object.keys(value)) {
                    row[key] = this.serializeValue(value[key]);
                }

                serializedValues.push(row);
            }
        } else if (values) {
            serializedValues = {...values};

            for (const key of Object.keys(serializedValues)) {
                serializedValues[key] = this.serializeValue(values[key]);
            }
        }

        await this.client.query(
            'INSERT INTO reversible_queries (operation, "table", "values", condition, block_num, reader) ' +
            'VALUES ($1, $2, $3, $4, $5, $6);',
            [operation, table, JSON.stringify(serializedValues), JSON.stringify(serializedCondition), this.currentBlock, this.name]
        );
    }

    async rollbackReversibleBlocks(blockNum: number, lock: boolean = true): Promise<void> {
        await this.acquireLock(lock);

        try {
            const query = await this.client.query(
                'SELECT operation, "table", "values", condition ' +
                'FROM reversible_queries WHERE block_num >= $1 AND reader = $2' +
                'ORDER BY block_num DESC, id DESC;',
                [blockNum, this.name]
            );

            for (const row of query.rows) {
                const values = JSON.parse(row.values);
                const condition: Condition | null = JSON.parse(row.condition);

                if (condition) {
                    condition.values = condition.values.map((value) => this.deserializeValue(value));
                }

                if (values !== null) {
                    if (Array.isArray(values)) {
                        for (const value of values) {
                            for (const key of Object.keys(value)) {
                                value[key] = this.deserializeValue(value[key]);
                            }
                        }
                    } else {
                        for (const key of Object.keys(values)) {
                            values[key] = this.deserializeValue(values[key]);
                        }
                    }
                }

                if (row.operation === 'insert') {
                    await this.insert(row.table, values, [], false, false);
                } else if (row.operation === 'update') {
                    await this.update(row.table, values, condition, [], false, false);
                } else if (row.operation === 'delete') {
                    await this.delete(row.table, condition, false, false);
                } else {
                    throw Error('Invalid rollback operation in database');
                }
            }

            await this.client.query(
                'DELETE FROM reversible_queries WHERE block_num >= $1 AND reader = $2;',
                [blockNum, this.name]
            );
        } finally {
            this.releaseLock(lock);
        }
    }

    async clearForkDatabase(lock: boolean = true): Promise<void> {
        await this.acquireLock(lock);

        try {
            await this.client.query(
                'DELETE FROM reversible_queries WHERE block_num <= $1 AND name = $2',
                [this.lastIrreversibleBlock, this.name]
            );
        } finally {
            this.releaseLock(lock);
        }
    }

    async updateReaderPosition(block: ShipBlock, lock: boolean = true): Promise<void> {
        await this.acquireLock(lock);

        try {
            await this.client.query(
                'UPDATE contract_readers SET block_num = $1, block_time = $2, updated = $3 WHERE name = $4',
                [block.block_num, eosioTimestampToDate(block.timestamp).getTime(), Date.now(), this.name]
            );
        } finally {
            this.releaseLock(lock);
        }
    }

    async commit(): Promise<void> {
        await this.acquireLock();

        try {
            await this.client.query('COMMIT');
        } finally {
            this.releaseLock();
            this.client.release();
        }
    }

    async abort(): Promise<void> {
        await this.acquireLock();

        try {
            await this.client.query('ROLLBACK');
        } finally {
            this.releaseLock();
            this.client.release();
        }
    }

    serializeValue(value: any): SerializedValue {
        if (value instanceof Buffer) {
            return {
                type: 'bytes',
                data: [...value]
            };
        }

        if (ArrayBuffer.isView(value)) {
            return {
                type: 'bytes',
                data: [...Buffer.from(value.buffer, value.byteOffset, value.byteLength)]
            };
        }

        if (value instanceof Date) {
            return {
                type: 'date',
                data: value.getTime()
            };
        }

        return {
            type: 'raw',
            data: value
        };
    }

    deserializeValue(value: SerializedValue): any {
        if (value.type === 'bytes') {
            return new Uint8Array(value.data);
        }

        if (value.type === 'date') {
            return new Date(value.data);
        }

        return value.data;
    }

    compareValues(value1: any, value2: any): boolean {
        const serializedValue1 = this.serializeValue(value1);
        const serializedValue2 = this.serializeValue(value2);

        if (serializedValue1.type !== serializedValue2.type) {
            return false;
        }

        if (serializedValue1.type === 'bytes' && arraysEqual(serializedValue1.data, serializedValue2.data)) {
            return true;
        }

        if (serializedValue1.type === 'raw' && String(serializedValue1.data) === String(serializedValue2.data)) {
            return true;
        }

        return serializedValue1.data === serializedValue2.data;
    }

    private buildPrimaryCondition(values: {[key: string]: any}, primaryKey: string[], offset: number = 0): Condition {
        const conditionStr = primaryKey.map((key, index) => {
            return this.client.escapeIdentifier(key) + ' = $' + (offset + index + 1);
        }).join(' AND ');
        const conditionValues = primaryKey.map((key) => values[key]);

        return { str: conditionStr, values: conditionValues };
    }

    private removeIdenticalValues(
        currentValues: {[key: string]: any}, previousValues: {[key: string]: any}, primaryKey: string[] = []
    ): {[key: string]: any} {
        const keys = Object.keys(currentValues);
        const result: {[key: string]: any} = {};

        for (const key of keys) {
            if (primaryKey.indexOf(key) >= 0) {
                continue;
            }

            if (this.compareValues(currentValues[key], previousValues[key])) {
                continue;
            }

            result[key] = currentValues[key];
        }

        return result;
    }

    private changeQueryVarOffset(str: string, length: number, offset: number): string {
        let queryStr = str;

        for (let i = length; i > 0; i--) {
            queryStr = queryStr.replace('$' + i, '$' + (offset + i));
        }

        return queryStr;
    }

    private async acquireLock(lock: boolean = true): Promise<void> {
        if (!lock) {
            return;
        }

        await this.lock.acquireAsync();
    }

    private releaseLock(lock: boolean = true): void {
        if (!lock) {
            return;
        }
        
        this.lock.release();
    }
}
