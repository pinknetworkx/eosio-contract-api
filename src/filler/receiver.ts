import { Serialize } from 'eosjs';
import { Abi } from 'eosjs/dist/eosjs-rpc-interfaces';

import logger from '../utils/winston';
import ConnectionManager from '../connections/manager';
import StateHistoryBlockReader from '../connections/ship';
import { IReaderConfig } from '../types/config';
import { ShipActionTrace, ShipBlock, ShipBlockResponse, ShipContractRow, ShipTableDelta, ShipTransactionTrace } from '../types/ship';
import { EosioAction, EosioActionTrace, EosioTableRow, EosioTransaction } from '../types/eosio';
import { ContractDB, ContractDBTransaction } from './database';
import { binToHex } from '../utils/binary';
import { eosioTimestampToDate } from '../utils/eosio';
import DataProcessor, { ProcessingState } from './processor';
import { ContractHandler } from './handlers/interfaces';

type AbiCache = {
    types: Map<string, Serialize.Type>,
    block_num: number,
    json: Abi
};

function extractShipTraces(transactions: ShipTransactionTrace[]): Array<{trace: ShipActionTrace, tx: EosioTransaction}> {
    const result: Array<{trace: ShipActionTrace, tx: EosioTransaction}> = [];

    for (const transaction of transactions) {
        if (transaction[0] === 'transaction_trace_v0') {
            // transaction failed
            if (transaction[1].status !== 0) {
                continue;
            }

            const tx: EosioTransaction = {
                id: transaction[1].id,
                cpu_usage_us: transaction[1].cpu_usage_us,
                net_usage_words: transaction[1].net_usage_words
            };

            result.push(...transaction[1].action_traces.map((trace) => {
                return {trace, tx};
            }));
        } else {
            throw new Error('unsupported transaction response received: ' + transaction[0]);
        }
    }

    // sort by global_sequence because inline actions do not have the correct order
    result.sort((a, b) => {
        if (a.trace[0] === 'action_trace_v0' && b.trace[0] === 'action_trace_v0') {
            if (a.trace[1].receipt[0] === 'action_receipt_v0' && b.trace[1].receipt[0] === 'action_receipt_v0') {
                return parseInt(a.trace[1].receipt[1].global_sequence, 10) - parseInt(b.trace[1].receipt[1].global_sequence, 10);
            }

            throw new Error('unsupported trace receipt response received: ' + a.trace[0] + ' ' + b.trace[0]);
        }

        throw new Error('unsupported trace response received: ' + a.trace[0] + ' ' + b.trace[0]);
    });

    return result;
}

function extractShipDeltas(deltas: ShipTableDelta[]): Array<{present: boolean, data: ShipContractRow}> {
    const result: Array<{present: boolean, data: ShipContractRow}> = [];

    for (const delta of deltas) {
        if (delta[0] !== 'table_delta_v0') {
            throw new Error('Unsupported table delta response received: ' + delta[0]);
        }

        if (delta[1].name === 'contract_row') {
            for (const row of delta[1].rows) {
                result.push({present: row.present, data: <ShipContractRow>row.data});
            }
        }
    }

    return result;
}

export default class StateReceiver {
    currentBlock = 0;
    headBlock = 0;
    lastIrreversibleBlock = 0;

    collectedBlocks = 0;
    lastDatabaseTransaction?: ContractDBTransaction;
    handlerDestructors: Array<() => void> = [];

    readonly name: string;

    readonly ship: StateHistoryBlockReader;
    readonly processor: DataProcessor;

    private readonly database: ContractDB;
    private readonly abis: {[key: string]: AbiCache};

    constructor(
        readonly config: IReaderConfig,
        readonly connection: ConnectionManager,
        readonly handlers: ContractHandler[]
    ) {
        this.name = config.name;
        this.database = new ContractDB(this.config.name, this.connection);
        this.abis = {};

        this.processor = new DataProcessor(ProcessingState.CATCHUP);
        this.processor.onTrace('eosio', 'setcode', () => null);
        this.processor.onTrace('eosio', 'setabi', () => null);

        this.ship = connection.createShipBlockReader({
            min_block_confirmation: config.ship_min_block_confirmation,
            ds_threads: config.ds_threads,
            ds_experimental: config.ds_experimental
        });

        this.ship.consume(this.consumer.bind(this));
    }

    async startProcessing(): Promise<void> {
        let startBlock = await this.database.getReaderPosition() + 1;

        if (this.config.start_block > 0 && this.config.start_block < startBlock) {
            logger.warn('Reader start block cannot be lower than the last processed block. Ignoring config.');
        }

        startBlock = Math.max(startBlock, this.config.start_block);

        if (this.config.stop_block > 0 && startBlock > this.config.stop_block) {
            throw new Error('Reader end block cannot be lower than the starting block');
        }

        logger.info('Reader ' + this.config.name + ' starting on block #' + startBlock);

        for (const handler of this.handlers) {
            this.handlerDestructors.push(await handler.register(this.processor));
        }

        this.ship.startProcessing({
            start_block_num: startBlock,
            end_block_num: this.config.stop_block || 0xffffffff,
            max_messages_in_flight: this.config.ship_prefetch_blocks || 10,
            irreversible_only: this.config.irreversible_only || false,
            have_positions: await this.database.getLastReaderBlocks(),
            fetch_block: true,
            fetch_traces: true,
            fetch_deltas: true
        }, ['contract_row']);
    }

    async stopProcessing(): Promise<void> {
        this.ship.stopProcessing();

        this.handlerDestructors.map(unregister => unregister());
        this.handlerDestructors = [];

        logger.info('Reader stopped at block #' + this.currentBlock);
    }

    private async consumer(resp: ShipBlockResponse): Promise<void> {
        const dbGroupBlocks = this.config.db_group_blocks || 12;

        const blocksUntilHead = (this.config.irreversible_only ? resp.last_irreversible.block_num : resp.head.block_num) - resp.this_block.block_num;
        const isReversible = resp.this_block.block_num > resp.last_irreversible.block_num ? resp.this_block.block_num : 0;
        let commitSize = (isReversible || blocksUntilHead < dbGroupBlocks * 2) ? 1 : dbGroupBlocks;

        const db = (this.lastDatabaseTransaction && !isReversible) ? this.lastDatabaseTransaction : await this.database.startTransaction(isReversible);

        try {
            if (resp.this_block.block_num <= (this.currentBlock || this.ship.currentArgs.start_block_num)) {
                logger.info('Chain fork detected. Reverse all blocks which were affected');

                commitSize = 1;
                await db.rollbackReversibleBlocks(resp.this_block.block_num);

                const channelName = ['eosio-contract-api', this.connection.chain.name, this.name, 'chain'].join(':');
                await this.connection.redis.ioRedis.publish(channelName, JSON.stringify({
                    action: 'fork', block_num: resp.this_block.block_num
                }));
            }

            const traces = extractShipTraces(resp.traces);
            for (const row of traces) {
                await this.handleTrace(db, resp.block, row.trace, row.tx);
            }

            const deltas = extractShipDeltas(resp.deltas);
            for (const delta of deltas) {
                await this.handleDelta(db, resp.block, delta.data, delta.present);
            }

            if (isReversible) {
                await db.insert('reversible_blocks', {
                    reader: this.config.name,
                    block_id: Buffer.from(resp.this_block.block_id, 'hex'),
                    block_num: resp.this_block.block_num
                }, ['reader', 'block_num']);

                if (isReversible % 10 === 0) {
                    await db.clearForkDatabase(resp.last_irreversible.block_num);
                }
            }
        } catch (e) {
            logger.error('Error occurred while processing block #' + resp.this_block.block_num);

            await db.abort();

            throw e;
        }

        this.collectedBlocks += 1;
        this.currentBlock = resp.this_block.block_num;
        this.headBlock = resp.head.block_num;
        this.lastIrreversibleBlock = resp.last_irreversible.block_num;

        if (this.collectedBlocks >= commitSize) {
            try {
                await this.processor.execute();

                await db.updateReaderPosition(resp.block);
                await db.commit();

                this.collectedBlocks = 0;
                this.lastDatabaseTransaction = null;
            } catch (e) {
                if (this.collectedBlocks === 1) {
                    logger.error('Error occurred while executing block #' + resp.this_block.block_num);
                } else {
                    logger.error('Error occurred while executing block range from #' + (resp.this_block.block_num - this.collectedBlocks + 1) + ' to ' + resp.this_block.block_num);
                }

                await db.abort();

                throw e;
            }
        }
    }

    private async handleTrace(
        db: ContractDBTransaction, block: ShipBlock, actionTrace: ShipActionTrace, tx: EosioTransaction
    ): Promise<void> {
        if (actionTrace[0] === 'action_trace_v0') {
            const trace: EosioActionTrace = {
                action_ordinal: actionTrace[1].action_ordinal,
                creator_action_ordinal: actionTrace[1].creator_action_ordinal,
                global_sequence: actionTrace[1].receipt[1].global_sequence,
                account_ram_deltas: actionTrace[1].account_ram_deltas,
                act: {
                    account: actionTrace[1].act.account,
                    name: actionTrace[1].act.name,
                    authorization: actionTrace[1].act.authorization,
                    data: typeof actionTrace[1].act.data === 'string' ? actionTrace[1].act.data : binToHex(actionTrace[1].act.data)
                }
            };

            const processingInfo = this.processor.traceNeeded(trace.act.account, trace.act.name);

            if (processingInfo.deserialize) {
                const types = await this.fetchContractAbiTypes(actionTrace[1].act.account, block.block_num);
                const type = await this.getActionAbiType(actionTrace[1].act.account, actionTrace[1].act.name, block.block_num);

                if (types !== null && type !== null) {
                    try {
                        trace.act.data = this.ship.deserialize(type, actionTrace[1].act.data, types, false);
                    } catch (e) {
                        logger.warn(e);
                    }
                }

                if (trace.act.account === 'eosio' && trace.act.name === 'setcode') {
                    await this.handleCodeUpdate(block, trace.act);
                } else if (trace.act.account === 'eosio' && trace.act.name === 'setabi') {
                    await this.handleAbiUpdate(block, trace.act);
                } else {
                    logger.debug('Trace for reader ' + this.config.name + ' received', {
                        contract: trace.act.account, action: trace.act.name, data: trace.act.data
                    });

                    this.processor.processTrace(db, block, tx, trace);
                }
            } else if (processingInfo.process) {
                logger.debug('Trace for reader ' + this.config.name + ' received', {
                    contract: trace.act.account, action: trace.act.name
                });

                this.processor.processTrace(db, block, tx, trace);
            }

            return;
        }

        throw new Error('Unsupported trace response received: ' + actionTrace[0]);
    }

    private async handleDelta(
        db: ContractDBTransaction, block: ShipBlock, contractRow: ShipContractRow, present: boolean
    ): Promise<void> {
        if (contractRow[0] === 'contract_row_v0') {
            const delta: EosioTableRow = {
                ...contractRow[1], present,
                value: typeof contractRow[1].value === 'string' ? contractRow[1].value : binToHex(contractRow[1].value)
            };

            const processingInfo = this.processor.deltaNeeded(delta.code, delta.table);

            if (processingInfo.deserialize) {
                const types = await this.fetchContractAbiTypes(contractRow[1].code, block.block_num);
                const type = await this.getTableAbiType(contractRow[1].code, contractRow[1].table, block.block_num);

                if (type !== null && types !== null) {
                    try {
                        delta.value = this.ship.deserialize(type, contractRow[1].value, types);
                    } catch (e) {
                        logger.warn(e);
                    }
                }

                logger.debug('Table delta for reader ' + this.config.name + ' received', {
                    contract: delta.code, table: delta.table, scope: delta.scope, value: delta.value
                });

                this.processor.processDelta(db, block, delta);
            } else if (processingInfo.process) {
                logger.debug('Table delta for reader ' + this.config.name + ' received', {
                    contract: delta.code, table: delta.table, scope: delta.scope
                });

                this.processor.processDelta(db, block, delta);
            }

            return;
        }

        throw new Error('Unsupported contract row response received: ' + contractRow[0]);
    }

    private async handleAbiUpdate(block: ShipBlock, action: EosioAction): Promise<void> {
        if (typeof action.data !== 'string') {
            let abiJson, types;

            try {
                abiJson = this.connection.chain.deserializeAbi(action.data.abi);
                types = Serialize.getTypesFromAbi(Serialize.createInitialTypes(), abiJson);
            } catch (e) {
                logger.warn('Could not deserialize ABI of ' + action.data.account, e);

                return;
            }

            this.abis[action.data.account] = { json: abiJson, types, block_num: block.block_num };

            try {
                await this.connection.database.query(
                    'INSERT into contract_abis (account, abi, block_num, block_time) VALUES ($1, $2, $3, $4)',
                    [
                        action.data.account,
                        typeof action.data.abi === 'string' ? Buffer.from(action.data.abi, 'hex') : action.data.abi,
                        block.block_num,
                        eosioTimestampToDate(block.timestamp).getTime()
                    ]
                );

                logger.info('ABI updated for contract ' + action.data.account);
            } catch (e) {
                logger.info('ABI ' + action.data.account + ' already in cache. Ignoring ABI update');
            }
        } else {
            logger.error('Could not update ABI for contract because action could not be deserialized');
        }
    }

    private async handleCodeUpdate(block: ShipBlock, action: EosioAction): Promise<void> {
        if (typeof action.data !== 'string') {
            try {
                await this.connection.database.query(
                    'INSERT into contract_codes (account, block_num, block_time) VALUES ($1, $2, $3)',
                    [action.data.account, block.block_num, eosioTimestampToDate(block.timestamp).getTime()]
                );

                logger.info('Code updated for contract ' + action.data.account);
            } catch (e) {
                logger.info('Code ' + action.data.account + ' already in cache. Ignoring code update');
            }
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
}
