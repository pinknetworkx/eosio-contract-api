import { Serialize } from 'eosjs';
import { Abi } from 'eosjs/dist/eosjs-rpc-interfaces';

import logger from '../utils/winston';
import ConnectionManager from '../connections/manager';
import StateHistoryBlockReader from '../connections/ship';
import { IReaderConfig } from '../types/config';
import { ShipActionTrace, ShipBlock, ShipBlockResponse, ShipContractRow } from '../types/ship';
import { EosioAction, EosioActionTrace, EosioTableRow, EosioTransaction } from '../types/eosio';
import { ContractDB, ContractDBTransaction } from './database';
import { binToHex } from '../utils/binary';
import { eosioDeserialize, eosioTimestampToDate, getActionAbiType, getTableAbiType } from '../utils/eosio';
import DataProcessor, { ProcessingState } from './processor';
import { ContractHandler } from './handlers/interfaces';
import ApiNotificationSender from './notifier';
import Semaphore from '../utils/semaphore';
import PQueue from 'p-queue';
import { StaticPool } from 'node-worker-threads-pool';

type AbiCache = {
    types: Map<string, Serialize.Type>,
    block_num: number,
    json: Abi
};

type ExtracterData = {
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

    dsWorkers: StaticPool<{type: string, data: any}, any>;
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
        readonly handlers: ContractHandler[]
    ) {
        this.name = config.name;
        this.database = new ContractDB(this.config.name, this.connection);
        this.abis = {};

        this.processor = new DataProcessor(ProcessingState.CATCHUP);
        this.processor.onTrace('eosio', 'setcode', () => null);
        this.processor.onTrace('eosio', 'setabi', () => null);

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

        await this.loadDeserializationWorkers();

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

        await this.dsWorkers.destroy();
        this.dsWorkers = null;

        logger.info('Reader stopped at block #' + this.currentBlock);
    }

    async loadDeserializationWorkers(): Promise<void> {
        logger.info('Contract ABIs updated. Reinitializing deserialization workers');

        const rules = this.processor.getRules(true);
        const contracts = this.processor.getContracts(true);

        const abis: any = {};

        for (const contract of contracts) {
            if (contract === '*') {
                continue;
            }

            const abi = await this.fetchContractAbi(contract, this.currentBlock);

            abis[contract] = {
                block_num: abi.block_num,
                json: abi.json
            };
        }

        this.dsWorkers = new StaticPool({
            size: this.config.ds_contract_threads,
            task: './build/workers/extracter.js',
            workerData: {rules: rules, abis: abis}
        });
    }

    private async consumer(resp: ShipBlockResponse): Promise<void> {
        await this.dsLock.acquire();

        const traces = this.dsWorkers.exec({type: 'traces', data: resp.traces});
        const deltas = this.dsWorkers.exec({type: 'deltas', data: resp.deltas});

        this.dsQueue.add(async () => {
            try {
                const tracesResp = await traces;
                const deltasResp = await deltas;

                if (!tracesResp.success) {
                    // noinspection ExceptionCaughtLocallyJS
                    throw new Error(tracesResp.message);
                }

                if (!deltasResp.success) {
                    // noinspection ExceptionCaughtLocallyJS
                    throw new Error(deltasResp.message);
                }

                await this.process(resp, tracesResp.data, deltasResp.data);
            } catch (error) {
                this.dsQueue.clear();
                this.dsQueue.pause();

                logger.error('Contract deserialization queue stopped duo to an error at #' + resp.this_block.block_num, error);

                return;
            }

            this.dsLock.release();
        }).then();
    }

    private async process(
        resp: ShipBlockResponse,
        traces: Array<{trace: ShipActionTrace<any>, tx: EosioTransaction}>,
        deltas: Array<{present: boolean, data: ShipContractRow<any>}>
    ): Promise<void> {
        const dbGroupBlocks = this.config.db_group_blocks || 12;

        const blocksUntilHead = (this.config.irreversible_only ? resp.last_irreversible.block_num : resp.head.block_num) - resp.this_block.block_num;
        const isReversible = resp.this_block.block_num > resp.last_irreversible.block_num ? resp.this_block.block_num : 0;
        let commitSize = (isReversible || blocksUntilHead < dbGroupBlocks * 2) ? 1 : dbGroupBlocks;

        if (this.processor.getState() === ProcessingState.CATCHUP && (isReversible || blocksUntilHead < dbGroupBlocks * 2)) {
            logger.info('Catchup completed. Switching to head mode');

            this.processor.setState(ProcessingState.HEAD);

            await this.loadDeserializationWorkers();
        }

        const db = (this.lastDatabaseTransaction && !isReversible) ? this.lastDatabaseTransaction : await this.database.startTransaction(isReversible);

        try {
            if (resp.this_block.block_num <= this.currentBlock) {
                logger.info('Chain fork detected. Reverse all blocks which were affected');

                commitSize = 1;
                await db.rollbackReversibleBlocks(resp.this_block.block_num);

                this.notifier.sendFork(resp.block);
            }

            for (const row of traces) {
                await this.handleTrace(resp.block, row.trace, row.tx);
            }

            for (const row of deltas) {
                await this.handleDelta(resp.block, row.data, row.present);
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

    private async handleTrace(block: ShipBlock, actionTrace: ShipActionTrace<ExtracterData>, tx: EosioTransaction): Promise<void> {
        if (actionTrace[0] === 'action_trace_v0') {
            if (actionTrace[1].receiver !== actionTrace[1].act.account) {
                return;
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
                    data: null
                }
            };

            const processingInfo = this.processor.traceNeeded(trace.act.account, trace.act.name);

            if (processingInfo.deserialize) {
                const abi = await this.fetchContractAbi(actionTrace[1].act.account, block.block_num);

                if (actionTrace[1].act.data.json && actionTrace[1].act.data.block_num === abi.block_num) {
                    trace.act.data = actionTrace[1].act.data.json;
                } else {
                    logger.warn('Received trace from outdated ABI', {
                        account: trace.act.account, name: trace.act.name
                    });

                    const types = await this.fetchContractAbiTypes(actionTrace[1].act.account, block.block_num);
                    const type = await this.getActionAbiType(actionTrace[1].act.account, actionTrace[1].act.name, block.block_num);

                    if (types && type) {
                        try {
                            trace.act.data = eosioDeserialize(type, actionTrace[1].act.data.binary, types, false);
                        } catch (e) {
                            logger.error(e);

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

                    this.processor.processTrace(block, tx, trace);
                }
            } else if (processingInfo.process) {
                logger.debug('Trace for reader ' + this.config.name + ' received', {
                    contract: trace.act.account, action: trace.act.name
                });

                trace.act.data = typeof actionTrace[1].act.data === 'string' ? actionTrace[1].act.data : binToHex(actionTrace[1].act.data);

                this.processor.processTrace(block, tx, trace);
            }

            return;
        }

        throw new Error('Unsupported trace response received: ' + actionTrace[0]);
    }

    private async handleDelta(block: ShipBlock, contractRow: ShipContractRow<ExtracterData>, present: boolean): Promise<void> {
        if (contractRow[0] === 'contract_row_v0') {
            const delta: EosioTableRow = {
                ...contractRow[1], present,
                value: null
            };

            const processingInfo = this.processor.tableNeeded(delta.code, delta.table);

            if (processingInfo.deserialize) {
                const abi = await this.fetchContractAbi(contractRow[1].code, block.block_num);

                if (contractRow[1].value.json && contractRow[1].value.block_num === abi.block_num) {
                    delta.value = contractRow[1].value.json;
                } else {
                    logger.warn('Received delta from outdated ABI', {
                        contract: delta.code, table: delta.table, scope: delta.scope
                    });

                    const types = await this.fetchContractAbiTypes(contractRow[1].code, block.block_num);
                    const type = await this.getTableAbiType(contractRow[1].code, contractRow[1].table, block.block_num);

                    if (types && type) {
                        try {
                            delta.value = eosioDeserialize(type, contractRow[1].value.binary, types);
                        } catch (e) {
                            logger.error(e);

                            throw e;
                        }
                    }
                }

                logger.debug('Table delta for reader ' + this.config.name + ' received', {
                    contract: delta.code, table: delta.table, scope: delta.scope, value: delta.value
                });

                this.processor.processTable(block, delta);
            } else if (processingInfo.process) {
                logger.debug('Table delta for reader ' + this.config.name + ' received', {
                    contract: delta.code, table: delta.table, scope: delta.scope
                });
                
                delta.value = typeof contractRow[1].value.binary === 'string' ? contractRow[1].value.binary : binToHex(contractRow[1].value.binary);

                this.processor.processTable(block, delta);
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

            const contracts = this.processor.getContracts(true);

            // reload workers because new ABI is loaded
            if (contracts.indexOf(action.data.account) >= 0 || contracts.indexOf('*') >= 0) {
                await this.loadDeserializationWorkers();
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
