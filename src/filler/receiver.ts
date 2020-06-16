import { Serialize } from 'eosjs';
import { Abi } from 'eosjs/dist/eosjs-rpc-interfaces';

import logger from '../utils/winston';
import ConnectionManager from '../connections/manager';
import StateHistoryBlockReader from '../connections/ship';
import { IReaderConfig } from '../types/config';
import { ShipActionTrace, ShipBlock, ShipContractRow, ShipHeader, ShipTableDelta, ShipTransactionTrace } from '../types/ship';
import { EosioAction, EosioActionTrace, EosioTableRow, EosioTransaction } from '../types/eosio';
import { ContractDB, ContractDBTransaction } from './database';
import { ContractHandler } from './handlers/interfaces';
import { binToHex } from '../utils/binary';
import { eosioTimestampToDate } from '../utils/eosio';
import { PromiseEventHandler } from '../utils/event';

type AbiCache = {
    types: Map<string, Serialize.Type>,
    block_num: number,
    json: Abi
};

export default class StateReceiver {
    currentBlock = 0;
    headBlock = 0;
    lastIrreversibleBlock = 0;

    private readonly ship: StateHistoryBlockReader;
    private readonly database: ContractDB;

    private readonly abis: {[key: string]: AbiCache};

    constructor(
        private readonly config: IReaderConfig,
        private readonly connection: ConnectionManager,
        private readonly events: PromiseEventHandler,
        private readonly handlers: ContractHandler[]
    ) {
        this.ship = connection.createShipBlockReader({
            min_block_confirmation: config.ship_min_block_confirmation
        });

        this.database = new ContractDB(this.config.name, this.connection);
        this.abis = {};

        this.ship.consume(this.consumer.bind(this));
    }

    async startProcessing(): Promise<void> {
        let startBlock = await this.database.getReaderPosition() + 1;

        if (this.config.start_block > 0 && this.config.start_block < startBlock) {
            logger.error('Reader start block cannot be lower than the last processed block. Ignoring config.');
        }

        startBlock = Math.max(startBlock, this.config.start_block);

        if (this.config.stop_block > 0 && startBlock > this.config.stop_block) {
            throw new Error('Reader end block cannot be lower than the starting block');
        }

        logger.info('Reader ' + this.config.name + ' starting on block #' + startBlock);

        this.ship.startProcessing({
            start_block_num: startBlock,
            end_block_num: this.config.stop_block || 0xffffffff,
            max_messages_in_flight: this.config.ship_prefetch_blocks || 10,
            irreversible_only: this.config.irreversible_only || false,
            have_positions: await this.database.getLastReaderBlocks(),
            fetch_block: true,
            fetch_traces: true,
            fetch_deltas: true
        });
    }

    private async consumer(header: ShipHeader, rawBlock: Uint8Array, rawTraces: Uint8Array, rawDeltas: Uint8Array): Promise<void> {
        // process deltas of first block because it could be started from a snapshot
        let processDeltas = this.currentBlock === 0;

        const block: ShipBlock = { ...header.this_block, ...this.ship.deserialize('signed_block', rawBlock) };
        const traces: ShipTransactionTrace[] = this.ship.deserialize('transaction_trace[]', rawTraces);

        const db = await this.database.startTransaction(header.this_block.block_num, header.last_irreversible.block_num);

        if (header.this_block.block_num <= this.currentBlock) {
            logger.info('Chain fork detected. Reverse all blocks which were affected');

            await db.rollbackReversibleBlocks(header.this_block.block_num);

            const channelName = ['eosio-contract-api', this.connection.chain.name, 'chain'].join(':');
            await this.connection.redis.ioRedis.publish(channelName, JSON.stringify({
                action: 'fork', block_num: header.this_block.block_num
            }));
        }

        const actionTraces = this.extractTransactionTraces(traces);

        for (const row of actionTraces) {
            processDeltas = await this.handleActionTrace(db, block, row.trace, row.tx) || processDeltas;
        }

        if (processDeltas) {
            const deltas: ShipTableDelta[] = this.ship.deserialize('table_delta[]', rawDeltas);

            for (const delta of deltas) {
                await this.handleDelta(db, block, delta);
            }

            await db.updateReaderPosition(block);
        }

        if (header.this_block.block_num > header.last_irreversible.block_num) {
            await db.updateReaderPosition(block);

            await db.insert('reversible_blocks', {
                reader: this.config.name,
                block_id: Buffer.from(header.this_block.block_id, 'hex'),
                block_num: header.this_block.block_num
            }, ['reader', 'block_num']);

            await db.clearForkDatabase();
        } else if (header.this_block.block_num % 100 === 0) {
            await db.updateReaderPosition(block);
        }

        for (const handler of this.handlers) {
            await handler.onBlockComplete(db, block);
        }

        this.currentBlock = header.this_block.block_num;
        this.headBlock = header.head.block_num;
        this.lastIrreversibleBlock = header.last_irreversible.block_num;

        await db.commit();

        for (const handler of this.handlers) {
            await handler.onCommit(block);
        }
    }

    private extractTransactionTraces(transactions: ShipTransactionTrace[]): Array<{trace: ShipActionTrace, tx: EosioTransaction}> {
        const traces: Array<{trace: ShipActionTrace, tx: EosioTransaction}> = [];

        for (const transaction of transactions) {
            if (transaction[0] === 'transaction_trace_v0') {
                if (transaction[1].status !== 0) {
                    logger.warn('Failed transaction ' + transaction[1].id + ' received from ship');

                    continue;
                }

                const tx: EosioTransaction = {
                    id: transaction[1].id,
                    cpu_usage_us: transaction[1].cpu_usage_us,
                    net_usage_words: transaction[1].net_usage_words
                };

                traces.push(...transaction[1].action_traces.map((trace) => {
                    return {trace, tx};
                }));
            } else {
                throw new Error('unsupported transaction response received: ' + transaction[0]);
            }
        }

        // sort by global_sequence because inline actions do not have the correct order
        traces.sort((a, b) => {
            if (a.trace[0] === 'action_trace_v0' && b.trace[0] === 'action_trace_v0') {
                if (a.trace[1].receipt[0] === 'action_receipt_v0' && b.trace[1].receipt[0] === 'action_receipt_v0') {
                    return parseInt(a.trace[1].receipt[1].global_sequence, 10) - parseInt(b.trace[1].receipt[1].global_sequence, 10);
                }

                throw new Error('unsupported trace receipt response received: ' + a.trace[0] + ' ' + b.trace[0]);
            }

            throw new Error('unsupported trace response received: ' + a.trace[0] + ' ' + b.trace[0]);
        });

        return traces;
    }

    private async handleActionTrace(
        db: ContractDBTransaction, block: ShipBlock, actionTrace: ShipActionTrace, tx: EosioTransaction
    ): Promise<boolean> {
        if (actionTrace[0] === 'action_trace_v0') {
            // ignore if its a notification
            if (actionTrace[1].receiver !== actionTrace[1].act.account) {
                return this.areDeltasNeeded(actionTrace[1].receiver);
            }

            if (this.isActionBlacklisted(actionTrace[1].act.account, actionTrace[1].act.name)) {
                return false;
            }

            const trace: EosioActionTrace = {
                action_ordinal: actionTrace[1].action_ordinal,
                creator_action_ordinal: actionTrace[1].creator_action_ordinal,
                global_sequence: actionTrace[1].receipt[1].global_sequence,
                account_ram_deltas: actionTrace[1].account_ram_deltas,
                act: {
                    account: actionTrace[1].act.account,
                    name: actionTrace[1].act.name,
                    authorization: actionTrace[1].act.authorization,
                    data: binToHex(actionTrace[1].act.data)
                }
            };

            const rawHandlers = this.getActionHandlers(actionTrace[1].act.account, actionTrace[1].act.name, false);
            if (rawHandlers.length > 0) {
                await this.handleAction(rawHandlers, db, block, trace, tx);
            }

            const dataHandlers = this.getActionHandlers(actionTrace[1].act.account, actionTrace[1].act.name, true);
            if (dataHandlers.length > 0 || this.isActionWhitelisted(actionTrace[1].act.account, actionTrace[1].act.name)) {
                const types = await this.fetchContractAbiTypes(actionTrace[1].act.account, block.block_num);
                const type = await this.getActionAbiType(actionTrace[1].act.account, actionTrace[1].act.name, block.block_num);

                // save hex data if ABI does not exist for contract
                if (types !== null && type !== null) {
                    try {
                        trace.act.data = this.ship.deserialize(type, actionTrace[1].act.data, types, false);
                    } catch (e) {
                        logger.warn(e);
                    }
                }

                await this.handleAction(dataHandlers, db, block, trace, tx);
            }

            return this.areDeltasNeeded(actionTrace[1].act.account);
        }

        await db.abort();

        throw new Error('Unsupported trace response received: ' + actionTrace[0]);
    }

    private async handleAction(
        handlers: ContractHandler[], db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace, tx: EosioTransaction
    ): Promise<void> {
        if (trace.act.account === 'eosio') {
            if (trace.act.name === 'setcode') {
                await this.handleCodeUpdate(db, block, trace.act);
            } else if (trace.act.name === 'setabi') {
                await this.handleAbiUpdate(db, block, trace.act);
            }
        }

        logger.debug('Action for reader ' + this.config.name + ' received', {
            account: trace.act.account, name: trace.act.name, txid: tx.id
        });

        for (const handler of handlers) {
            await handler.onAction(db, block, trace, tx);
        }
    }

    private async handleDelta(db: ContractDBTransaction, block: ShipBlock, delta: ShipTableDelta): Promise<void> {
        if (delta[0] === 'table_delta_v0') {
            const whitelist = ['contract_row'];

            if (whitelist.indexOf(delta[1].name) >= 0) {
                const rows = delta[1].rows.map((row) => {
                    return {
                        present: row.present,
                        data: this.ship.deserialize(delta[1].name, row.data)
                    };
                });

                if (delta[1].name === 'contract_row') {
                    for (const row of rows) {
                        await this.handleContractRow(db, block, row.data, row.present);
                    }
                }
            }

            return;
        }

        await db.abort();

        throw new Error('Unsupported table delta response received: ' + delta[0]);
    }

    private async handleContractRow(
        db: ContractDBTransaction, block: ShipBlock, contractRow: ShipContractRow, present: boolean
    ): Promise<void> {
        if (contractRow[0] === 'contract_row_v0') {
            if (this.isTableBlacklisted(contractRow[1].code, contractRow[1].table)) {
                return;
            }

            const tableDelta = { ...contractRow[1], present, value: binToHex(contractRow[1].value) };

            const rawHandlers = this.getTableHandlers(contractRow[1].code, contractRow[1].table, false);
            if (rawHandlers.length > 0) {
                await this.handleTableDelta(rawHandlers, db, block, tableDelta);
            }

            const dataHandlers = this.getTableHandlers(contractRow[1].code, contractRow[1].table, true);
            if (dataHandlers.length > 0) {
                const types = await this.fetchContractAbiTypes(contractRow[1].code, block.block_num);
                const type = await this.getTableAbiType(contractRow[1].code, contractRow[1].table, block.block_num);

                if (type !== null && types !== null) {
                    try {
                        tableDelta.value = this.ship.deserialize(type, contractRow[1].value, types);
                    } catch (e) {
                        logger.warn(e);
                    }
                }

                await this.handleTableDelta(dataHandlers, db, block, tableDelta);
            }

            return;
        }

        await db.abort();

        throw new Error('Unsupported contract row response received: ' + contractRow[0]);
    }

    private async handleTableDelta(
        handlers: ContractHandler[], db: ContractDBTransaction, block: ShipBlock, tableData: EosioTableRow
    ): Promise<void> {
        logger.debug('Table delta for reader ' + this.config.name + ' received', {
            contract: tableData.code, table: tableData.table, scope: tableData.scope
        });

        for (const handler of handlers) {
            await handler.onTableChange(db, block, tableData);
        }
    }

    private async handleAbiUpdate(db: ContractDBTransaction, block: ShipBlock, action: EosioAction): Promise<void> {
        if (typeof action.data !== 'string') {
            let abiJson;

            try {
                abiJson = this.connection.chain.deserializeAbi(action.data.abi);
            } catch (e) {
                logger.warn('Could not deserialize ABI of ' + action.data.account, e);

                return;
            }

            const types = Serialize.getTypesFromAbi(Serialize.createInitialTypes(), abiJson);

            this.abis[action.data.account] = { json: abiJson, types, block_num: block.block_num };

            const query = await db.client.query(
                'SELECT account FROM contract_abis WHERE account = $1 AND block_num = $2',
                [action.data.account, block.block_num]
            );

            if (query.rows.length === 0) {
                await db.insert('contract_abis', {
                    account: action.data.account,
                    abi: action.data.abi,
                    block_num: block.block_num,
                    block_time: eosioTimestampToDate(block.timestamp).getTime()
                }, ['account', 'block_num']);
            } else {
                logger.info('ABI ' + action.data.account + ' already in cache. Ignoring ABI update');
            }

            logger.info('ABI updated for contract ' + action.data.account);
        } else {
            logger.error('Could not update ABI for contract because action could not be deserialized');
        }
    }

    private async handleCodeUpdate(db: ContractDBTransaction, block: ShipBlock, action: EosioAction): Promise<void> {
        if (typeof action.data !== 'string') {
            const query = await db.client.query(
                'SELECT account FROM contract_codes WHERE account = $1 AND block_num = $2',
                [action.data.account, block.block_num]
            );

            if (query.rows.length === 0) {
                await db.insert('contract_codes', {
                    account: action.data.account,
                    block_num: block.block_num,
                    block_time: eosioTimestampToDate(block.timestamp).getTime()
                }, ['account', 'block_num']);
            } else {
                logger.info('Code ' + action.data.account + ' already in cache. Ignoring code update');
            }

            logger.info('Code updated for contract ' + action.data.account);
        } else {
            logger.error('Could not update contract code because action could not be deserialized');
        }
    }

    private async fetchContractAbi(contract: string, blockNum: number): Promise<AbiCache> {
        if (this.abis[contract] && this.abis[contract].block_num <= blockNum) {
            return this.abis[contract];
        }

        let abiJson: Abi, abiBlock: number;

        let rawAbi = await this.database.fetchAbi(contract, blockNum);

        if (rawAbi) {
            try {
                abiJson = this.connection.chain.deserializeAbi(rawAbi.data);
                abiBlock = rawAbi.block_num;
            } catch (e) {
                logger.warn('Could not deserialize ABI of ' + contract, e);
            }
        }

        if (!abiJson) {
            logger.warn('Could not find ABI for ' + contract + ' in cache, so requesting it...');

            rawAbi = await this.database.fetchNextAbi(contract, blockNum);

            if (rawAbi) {
                try {
                    abiJson = this.connection.chain.deserializeAbi(rawAbi.data);
                    abiBlock = rawAbi.block_num;
                } catch (e) {
                    logger.warn('Could not deserialize ABI of ' + contract, e);
                }
            } else {
                try {
                    abiJson = (await this.connection.chain.rpc.get_abi(contract)).abi;
                    abiBlock = blockNum;
                } catch (e) {
                    logger.warn('Could not fetch ABI of ' + contract, e);
                }
            }
        }

        const cache = {
            json: abiJson ? abiJson : null,
            types: abiJson ? Serialize.getTypesFromAbi(Serialize.createInitialTypes(), abiJson) : null,
            block_num: abiBlock
        };

        if (cache.types === null) {
            logger.warn('ABI for contract ' + contract + ' not found');
        }

        if (!this.abis[contract] || this.abis[contract].block_num <= abiBlock) {
            this.abis[contract] = cache;
        }

        return cache;
    }

    private async fetchContractAbiTypes(contract: string, blockNum: number): Promise<Map<string, Serialize.Type>> {
        const cache = await this.fetchContractAbi(contract, blockNum);

        return cache.types;
    }

    private async getTableAbiType(contract: string, table: string, blockNum: number): Promise<string | null> {
        const cache = await this.fetchContractAbi(contract, blockNum);

        if (!cache.json) {
            return null;
        }

        for (const row of cache.json.tables) {
            if (row.name === table) {
                return row.type;
            }
        }

        return null;
    }

    private async getActionAbiType(contract: string, action: string, blockNum: number): Promise<string | null> {
        const cache = await this.fetchContractAbi(contract, blockNum);

        if (!cache.json) {
            return null;
        }

        for (const row of cache.json.actions) {
            if (row.name === action) {
                return row.type;
            }
        }

        return null;
    }

    private getTableHandlers(contract: string, table?: string, deserialize: boolean | null = null): ContractHandler[] {
        return this.getHandlers('tables', contract, table, deserialize);
    }

    private getActionHandlers(contract: string, action?: string, deserialize: boolean | null = null): ContractHandler[] {
        return this.getHandlers('actions', contract, action, deserialize);
    }

    private getHandlers(group: string, contract: string, name: string, deserialize: boolean | null = null): ContractHandler[] {
        const handlers = [];

        for (const handler of this.handlers) {
            if (!Array.isArray(handler.scope[group])) {
                continue;
            }

            if (this.currentBlock < handler.minBlock) {
                continue;
            }

            for (const config of handler.scope[group]) {
                if (deserialize !== null && config.deserialize !== deserialize) {
                    continue;
                }

                if (!StateReceiver.matchFilter(config.filter, contract, name)) {
                    continue;
                }

                handlers.push(handler);
            }
        }

        return handlers;
    }

    private areDeltasNeeded(account: string): boolean {
        for (const handler of this.handlers) {
            if (!Array.isArray(handler.scope.tables)) {
                continue;
            }

            if (this.currentBlock < handler.minBlock) {
                continue;
            }

            for (const config of handler.scope.tables) {
                if (config.filter.split(':')[0] === account) {
                    return true;
                }
            }
        }

        return false;
    }

    private isActionBlacklisted(contract: string, action: string): boolean {
        const blacklist = ['eosio.null:*', 'eosio:onblock', 'eosio:onerror'];

        for (const filter of blacklist) {
            if (!StateReceiver.matchFilter(filter, contract, action)) {
                continue;
            }

            return true;
        }

        return false;
    }

    private isTableBlacklisted(_1: string, _2: string): boolean {
        return false;
    }

    private isActionWhitelisted(contract: string, action: string): boolean {
        const whitelist = ['eosio:setcode', 'eosio:setabi'];

        for (const filter of whitelist) {
            if (!StateReceiver.matchFilter(filter, contract, action)) {
                continue;
            }

            return true;
        }

        return false;
    }

    private static matchFilter(filter: string, contract: string, name?: string): boolean {
        const split = filter.split(':');

        if (split[0] === contract || split[0] === '*') {
            if (split[1] === '*' || !name) {
                return true;
            }

            if (split[1] === name) {
                return true;
            }
        }

        return false;
    }
}
