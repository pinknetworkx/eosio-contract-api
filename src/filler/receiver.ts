import { Serialize } from 'eosjs';
import { Abi } from 'eosjs/dist/eosjs-rpc-interfaces';
import PQueue from 'p-queue';

import logger from '../utils/winston';
import ConnectionManager from '../connections/manager';
import StateHistoryBlockReader from '../connections/ship';
import { IReaderConfig } from '../types/config';
import { ShipBlock, ShipBlockResponse, ShipTableDelta, ShipTransactionTrace } from '../types/ship';
import { EosioAction, EosioActionTrace, EosioContractRow, EosioTransaction } from '../types/eosio';
import { ContractDB, ContractDBTransaction } from './database';
import { binToHex } from '../utils/binary';
import {
    eosioDeserialize,
    eosioTimestampToDate,
    extractShipContractRows,
    extractShipTraces,
    getActionAbiType,
    getTableAbiType
} from '../utils/eosio';
import DataProcessor, { ProcessingState } from './processor';
import { ContractHandler } from './handlers/interfaces';
import ApiNotificationSender from './notifier';
import Semaphore from '../utils/semaphore';
import { ModuleLoader } from './modules';

type AbiCache = {
    types: Map<string, Serialize.Type>,
    block_num: number,
    json: Abi
};

type ContractDataEstimation = {
    binary: Uint8Array,
    json: any,
    block_num: number
};

export default class StateReceiver {
    currentBlock = 0;
    headBlock = 0;
    lastIrreversibleBlock = 0;

    lastCommittedBlock = 0;
    blocksUntilHead = 0;

    collectedBlocks = 0;
    lastBlockUpdate = 0;
    lastDatabaseTransaction?: ContractDBTransaction;
    handlerDestructors: Array<() => void> = [];

    readonly name: string;

    readonly dsLock: Semaphore;
    readonly dsQueue: PQueue;

    readonly ship: StateHistoryBlockReader;
    readonly processor: DataProcessor;
    readonly notifier: ApiNotificationSender;

    private readonly database: ContractDB;
    private readonly abis: {[key: string]: AbiCache};

    constructor(
        readonly config: IReaderConfig,
        readonly connection: ConnectionManager,
        readonly handlers: ContractHandler[],
        readonly modules: ModuleLoader
    ) {
        this.name = config.name;
        this.database = new ContractDB(this.config.name, this.connection);
        this.abis = {};

        this.processor = new DataProcessor(ProcessingState.CATCHUP, this.modules);
        this.processor.onActionTrace('eosio', 'setcode', () => null);
        this.processor.onActionTrace('eosio', 'setabi', () => null);

        this.notifier = new ApiNotificationSender(this.connection, this.processor, this.name);

        this.ship = connection.createShipBlockReader({
            min_block_confirmation: config.ship_min_block_confirmation,
            ds_threads: config.ds_ship_threads
        });

        this.dsQueue = new PQueue({concurrency: 1, autoStart: true});
        this.dsLock = new Semaphore(config.ship_ds_queue_size);

        this.ship.consume(this.consumer.bind(this));
    }

    async startProcessing(): Promise<void> {
        const position = await this.database.getReaderPosition();

        this.processor.setState(position.live ? ProcessingState.HEAD : ProcessingState.CATCHUP);

        let startBlock = position.block_num + 1;

        if (this.config.start_block > 0 && this.config.start_block < startBlock) {
            logger.warn('Reader start block cannot be lower than the last processed block. Ignoring config.');
        }

        startBlock = Math.max(startBlock, this.config.start_block);

        if (this.config.stop_block > 0 && startBlock > this.config.stop_block) {
            throw new Error('Reader end block cannot be lower than the starting block');
        }

        logger.info('Reader ' + this.config.name + ' starting on block #' + startBlock);

        for (const handler of this.handlers) {
            this.handlerDestructors.push(await handler.register(this.processor, this.notifier));
        }

        this.currentBlock = startBlock - 1;
        this.lastBlockUpdate = startBlock - 1;

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
        await this.dsLock.acquire();

        const actionTraces = await this.prepareActionTraces(resp.this_block.block_num, resp.traces);
        const contractRows = await this.prepareContractRows(resp.this_block.block_num, resp.deltas);

        this.dsQueue.add(async () => {
            try {
                await this.process(resp, actionTraces, contractRows);
            } catch (error) {
                this.dsQueue.clear();
                this.dsQueue.pause();

                logger.error('Consumer queue stopped duo to an error at #' + resp.this_block.block_num, error);

                return;
            }

            this.dsLock.release();
        }).then();
    }

    private async process(
        resp: ShipBlockResponse,
        actionTraces: Array<{trace: EosioActionTrace<ContractDataEstimation>, tx: EosioTransaction<ContractDataEstimation>}>,
        contractRows: Array<EosioContractRow<ContractDataEstimation>>
    ): Promise<void> {
        const dbGroupBlocks = this.config.db_group_blocks || 12;

        const blocksUntilHead = (this.config.irreversible_only ? resp.last_irreversible.block_num : resp.head.block_num) - resp.this_block.block_num;
        const isReversible = resp.this_block.block_num > resp.last_irreversible.block_num ? resp.this_block.block_num : 0;
        let commitSize = (isReversible || blocksUntilHead < dbGroupBlocks * 2) ? 1 : dbGroupBlocks;

        if (this.processor.getState() === ProcessingState.CATCHUP && (isReversible || blocksUntilHead < dbGroupBlocks * 2)) {
            logger.info('Catchup completed. Switching to head mode');

            this.processor.setState(ProcessingState.HEAD);
        }

        const db = (this.lastDatabaseTransaction && !isReversible) ? this.lastDatabaseTransaction : await this.database.startTransaction(isReversible);

        try {
            if (resp.this_block.block_num <= this.currentBlock) {
                logger.info('Chain fork detected. Reverse all blocks which were affected');

                commitSize = 1;
                await db.rollbackReversibleBlocks(resp.this_block.block_num);

                this.notifier.sendFork(resp.block);
            }

            for (const row of actionTraces) {
                await this.handleActionTrace(resp.block, row.trace, row.tx);
            }

            for (const row of contractRows) {
                await this.handleContractRow(resp.block, row);
            }

            if (isReversible) {
                await db.insert('reversible_blocks', {
                    reader: this.config.name,
                    block_id: Buffer.from(resp.this_block.block_id, 'hex'),
                    block_num: resp.this_block.block_num
                }, ['reader', 'block_num']);

                if (isReversible % 12 === 0) {
                    await db.clearForkDatabase(resp.last_irreversible.block_num);
                }
            }
        } catch (e) {
            logger.error('Error occurred while processing block #' + resp.this_block.block_num);

            await db.abort();

            throw e;
        }

        this.lastDatabaseTransaction = db;
        this.collectedBlocks += 1;

        this.currentBlock = resp.this_block.block_num;
        this.headBlock = resp.head.block_num;
        this.lastIrreversibleBlock = resp.last_irreversible.block_num;
        this.blocksUntilHead = blocksUntilHead;

        if (this.collectedBlocks >= commitSize) {
            try {
                await this.processor.executeHeadQueue(db);

                if (
                    db.inTransaction || isReversible ||
                    this.processor.getState() === ProcessingState.HEAD ||
                    resp.this_block.block_num - this.lastBlockUpdate > 500
                ) {
                    await db.updateReaderPosition(resp.block, this.processor.getState() === ProcessingState.HEAD);

                    this.lastBlockUpdate = resp.this_block.block_num;
                }

                await db.commit();

                this.collectedBlocks = 0;
                this.lastDatabaseTransaction = null;
                this.lastCommittedBlock = resp.this_block.block_num;

                await this.processor.notifyCommit();
                await this.notifier.publish();
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

    private async handleActionTrace(block: ShipBlock, trace: EosioActionTrace<ContractDataEstimation>, tx: EosioTransaction<ContractDataEstimation>): Promise<void> {
        const processingInfo = this.processor.actionTraceNeeded(trace.act.account, trace.act.name);

        if (processingInfo.deserialize) {
            const abi = await this.fetchContractAbi(trace.act.account, block.block_num);

            if (trace.act.data.json && trace.act.data.block_num === abi.block_num) {
                trace.act.data = trace.act.data.json;
            } else {
                logger.info('Received trace from outdated ABI. Deserializing in sync mode.', {
                    account: trace.act.account, name: trace.act.name
                });

                const types = await this.fetchContractAbiTypes(trace.act.account, block.block_num);
                const type = await this.getActionAbiType(trace.act.account, trace.act.name, block.block_num);

                if (types && type) {
                    try {
                        trace.act.data = eosioDeserialize(type, trace.act.data.binary, types, false);
                    } catch (e) {
                        logger.error(
                            'Failed to deserialize trace in sync mode ' +
                            trace.act.account + ':' + trace.act.name + ' (abi version: ' + abi.block_num + ')', e
                        );

                        throw e;
                    }
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

                this.processor.processActionTrace(block, tx, trace);
            }
        } else if (processingInfo.process) {
            logger.debug('Trace for reader ' + this.config.name + ' received', {
                contract: trace.act.account, action: trace.act.name
            });

            // @ts-ignore
            trace.act.data = typeof trace.act.data === 'string' ? trace.act.data : binToHex(trace.act.data);

            this.processor.processActionTrace(block, tx, trace);
        }
    }

    private async handleContractRow(block: ShipBlock, delta: EosioContractRow<ContractDataEstimation>): Promise<void> {
        const processingInfo = this.processor.contractRowNeeded(delta.code, delta.table);

        if (processingInfo.deserialize) {
            const abi = await this.fetchContractAbi(delta.code, block.block_num);

            if (delta.value.json && delta.value.block_num === abi.block_num) {
                delta.value = delta.value.json;
            } else {
                logger.info('Received contract row from outdated ABI. Deserializing in sync mode.', {
                    contract: delta.code, table: delta.table, scope: delta.scope
                });

                const types = await this.fetchContractAbiTypes(delta.code, block.block_num);
                const type = await this.getTableAbiType(delta.code, delta.table, block.block_num);

                if (types && type) {
                    try {
                        delta.value = eosioDeserialize(type, delta.value.binary, types);
                    } catch (e) {
                        logger.error(
                            'Failed to deserialize contract row in sync mode ' +
                            delta.code + ':' + delta.table + ' (abi version: ' + abi.block_num + ')', e
                        );

                        throw e;
                    }
                }
            }

            logger.debug('Contract row for reader ' + this.config.name + ' received', {
                contract: delta.code, table: delta.table, scope: delta.scope, value: delta.value
            });

            this.processor.processContractRow(block, delta);
        } else if (processingInfo.process) {
            logger.debug('Contract row for reader ' + this.config.name + ' received', {
                contract: delta.code, table: delta.table, scope: delta.scope
            });

            // @ts-ignore
            delta.value = typeof delta.value.binary === 'string' ? delta.value.binary : binToHex(delta.value.binary);

            this.processor.processContractRow(block, delta);
        }
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

                logger.info('ABI updated for contract ' + action.data.account + ' at block #' + block.block_num);
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

                logger.info('Code updated for contract ' + action.data.account + ' at block #' + block.block_num);
            } catch (e) {
                logger.info('Code ' + action.data.account + ' already in cache. Ignoring code update');
            }
        } else {
            logger.error('Could not update contract code because action could not be deserialized');
        }
    }

    private async prepareActionTraces(
        blockNum: number, data: ShipTransactionTrace[]
    ): Promise<Array<{trace: EosioActionTrace<ContractDataEstimation>, tx: EosioTransaction<ContractDataEstimation>}>> {
        const traces = extractShipTraces(data);

        for (const row of traces) {
            const act = row.trace.act;

            act.data = <any>{
                binary: act.data,
                block_num: null,
                json: null
            };

            const processingInfo = this.processor.actionTraceNeeded(act.account, act.name);

            if (processingInfo.deserialize) {
                try {
                    const abi = await this.fetchContractAbi(act.account, blockNum);
                    const type = getActionAbiType(abi.json, act.account, act.name);

                    act.data = <any>{
                        // @ts-ignore
                        binary: act.data.binary,
                        // @ts-ignore
                        json: eosioDeserialize(type, act.data.binary, abi.types, false),
                        block_num: abi.block_num
                    };
                } catch (e) {
                    logger.warn('Failed to deserialize trace ' + act.account + ':' + act.name + ' in preprocessing', e);
                }
            }
        }

        return traces;
    }

    private async prepareContractRows(blockNum: number, data: ShipTableDelta[]): Promise<EosioContractRow<ContractDataEstimation>[]> {
        const deltas = extractShipContractRows(data);

        for (const delta of deltas) {
            delta.value = <any>{
                binary: delta.value,
                block_num: null,
                json: null
            };

            const processingInfo = this.processor.contractRowNeeded(delta.code, delta.table);

            if (processingInfo.deserialize) {
                try {
                    const abi = await this.fetchContractAbi(delta.code, blockNum);
                    const type = getTableAbiType(abi.json, delta.code, delta.table);

                    delta.value = <any>{
                        // @ts-ignore
                        binary: delta.value.binary,
                        // @ts-ignore
                        json: eosioDeserialize(type, delta.value.binary, abi.types),
                        block_num: abi.block_num
                    };
                } catch (e) {
                    logger.warn('Failed to deserialize table ' + delta.code + ':' + delta.table + ' in preprocessing', e);
                }
            }
        }

        return deltas;
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
                    abiBlock = -1;
                } catch (e) {
                    logger.warn('Could not deserialize ABI of ' + contract, e);
                }
            } else {
                try {
                    abiJson = (await this.connection.chain.rpc.get_abi(contract)).abi;
                    abiBlock = -1;
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

        if (!cache.types) {
            throw new Error('ABI Types not found');
        }

        return cache.types;
    }

    private async getTableAbiType(contract: string, table: string, blockNum: number): Promise<string | null> {
        const cache = await this.fetchContractAbi(contract, blockNum);

        if (!cache.json) {
            throw new Error('No contract ABI found');
        }

        return getTableAbiType(cache.json, contract, table);
    }

    private async getActionAbiType(contract: string, action: string, blockNum: number): Promise<string | null> {
        const cache = await this.fetchContractAbi(contract, blockNum);

        if (!cache.json) {
            throw new Error('No contract ABI found');
        }

        return getActionAbiType(cache.json, contract, action);
    }
}
