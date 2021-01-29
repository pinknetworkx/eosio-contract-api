import PQueue from 'p-queue';
import { Serialize } from 'eosjs';
import { Abi } from 'eosjs/dist/eosjs-rpc-interfaces';
import * as WebSocket from 'ws';
import { TextDecoder, TextEncoder } from 'text-encoding';
import { StaticPool } from 'node-worker-threads-pool';

import logger from '../utils/winston';
import {
    BlockRequestType,
    IBlockReaderOptions, ShipActionTrace, ShipBlockResponse, ShipContractRow, ShipTableDelta, ShipTransactionTrace
} from '../types/ship';
import { EosioTransaction } from '../types/eosio';

export type BlockConsumer = (block: ShipBlockResponse) => any;

export function extractShipTraces(transactions: ShipTransactionTrace[]): Array<{trace: ShipActionTrace, tx: EosioTransaction}> {
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

export function extractShipContractRows(deltas: ShipTableDelta[]): Array<{present: boolean, data: ShipContractRow}> {
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

export default class StateHistoryBlockReader {
    currentArgs: BlockRequestType;
    deltaWhitelist: string[];

    abi: Abi;
    types: Map<string, Serialize.Type>;
    tables: Map<string, string>;

    private ws: any;

    private connected: boolean;
    private connecting: boolean;
    private stopped: boolean;

    private blocksQueue: PQueue;
    private deserializeWorkers: StaticPool<Array<{type: string, data: Uint8Array, abi?: any}>, any>;

    private unconfirmed: number;
    private consumer: BlockConsumer;

    constructor(
        private readonly endpoint: string,
        private options: IBlockReaderOptions = {min_block_confirmation: 1, ds_threads: 4, ds_experimental: false}
    ) {
        this.connected = false;
        this.connecting = false;
        this.stopped = true;

        this.blocksQueue = new PQueue({concurrency: 1, autoStart: true});
        this.deserializeWorkers = undefined;

        this.consumer = null;

        this.abi = null;
        this.types = null;
        this.tables = new Map();

        this.deltaWhitelist = [];
    }

    setOptions(options?: IBlockReaderOptions, deltas?: string[]): void {
        if (options) {
            this.options = {...this.options, ...options};
        }

        if (deltas) {
            this.deltaWhitelist = deltas;
        }
    }

    connect(): void {
        if (!this.connected && !this.connecting && !this.stopped) {
            logger.info(`Connecting to ship endpoint ${this.endpoint}`);

            this.connecting = true;

            this.ws = new WebSocket(this.endpoint, { perMessageDeflate: false, maxPayload: 512 * 1024 * 1024 * 1024 });

            this.ws.on('open', () => this.onConnect());
            this.ws.on('message', (data: any) => this.onMessage(data));
            this.ws.on('close', () => this.onClose());
            this.ws.on('error', (e: Error) => { logger.error('Websocket error', e); });
        }
    }

    reconnect(): void {
        logger.info('Reconnecting to Ship...');

        setTimeout(() => {
            this.connect();
        }, 5000);
    }

    serialize(type: string, value: any, types?: Map<string, Serialize.Type>): Uint8Array {
        let serializeTypes: Map<string, Serialize.Type>;

        if (types) {
            serializeTypes = types;
        } else {
            serializeTypes = this.types;
        }

        const buffer = new Serialize.SerialBuffer({ textEncoder: new TextEncoder, textDecoder: new TextDecoder });
        Serialize.getType(serializeTypes, type).serialize(buffer, value);

        return buffer.asUint8Array();
    }

    deserialize(type: string, data: Uint8Array | string, types?: Map<string, Serialize.Type>, checkLength: boolean = true): any {
        let dataArray;
        if (typeof data === 'string') {
            dataArray = Uint8Array.from(Buffer.from(data, 'hex'));
        } else {
            dataArray = data;
        }

        let serializeTypes: Map<string, Serialize.Type>;
        if (types) {
            serializeTypes = types;
        } else {
            serializeTypes = this.types;
        }

        const buffer = new Serialize.SerialBuffer({ textEncoder: new TextEncoder, textDecoder: new TextDecoder, array: dataArray });
        const result = Serialize.getType(serializeTypes, type)
            .deserialize(buffer, new Serialize.SerializerState({ bytesAsUint8Array: true }));

        if (buffer.readPos !== data.length && checkLength) {
            throw new Error('Deserialization error: ' + type);
        }

        return result;
    }

    send(request: [string, any]): void {
        this.ws.send(this.serialize('request', request, this.types));
    }

    onConnect(): void {
        this.connected = true;
        this.connecting = false;
    }

    onMessage(data: any): void {
        try {
            if (!this.abi) {
                logger.info('Receiving ABI...');

                this.abi = JSON.parse(data);
                this.types = Serialize.getTypesFromAbi(Serialize.createInitialTypes(), this.abi);

                this.deserializeWorkers = new StaticPool({
                    size: this.options.ds_threads,
                    task: './build/workers/deserializer.js',
                    workerData: {
                        abi: data,
                        options: this.options
                    }
                });

                for (const table of this.abi.tables) {
                    this.tables.set(table.name, table.type);
                }

                if (!this.stopped) {
                    this.requestBlocks();
                }
            } else {
                const [type, response] = this.deserialize('result', data, this.types);

                if (type === 'get_blocks_result_v0') {
                    let block: any = null;
                    let traces: any = [];
                    let deltas: any = [];

                    if (response.this_block) {
                        if (response.block) {
                            block = this.deserializeParallel('signed_block', response.block);
                        } else if(this.currentArgs.fetch_block) {
                            logger.warn('Block #' + response.this_block.block_num + ' does not contain block data');
                        }

                        if (response.traces) {
                            traces = this.deserializeParallel('transaction_trace[]', response.traces);
                        } else if(this.currentArgs.fetch_traces) {
                            logger.warn('Block #' + response.this_block.block_num + ' does not contain trace data');
                        }

                        if (response.deltas) {
                            deltas = this.deserializeDeltas(response.deltas);
                        } else if(this.currentArgs.fetch_deltas) {
                            logger.warn('Block #' + response.this_block.block_num + ' does not contain delta data');
                        }
                    }

                    this.blocksQueue.add(async () => {
                        let deserializedTraces = [];
                        let deserializedDeltas = [];

                        try {
                            deserializedTraces = await traces;
                        } catch (error) {
                            logger.error('Failed to deserialize traces at block #' + response.this_block.block_num, error);

                            throw error;
                        }

                        try {
                            deserializedDeltas = await deltas;
                        } catch (error) {
                            logger.error('Failed to deserialize deltas at block #' + response.this_block.block_num, error);

                            throw error;
                        }

                        try {
                            await this.processBlock({
                                this_block: response.this_block,
                                head: response.head,
                                last_irreversible: response.last_irreversible,
                                prev_block: response.prev_block,
                                block: Object.assign(
                                    {...response.this_block},
                                    await block,
                                    {last_irreversible: response.last_irreversible},
                                    {head: response.head}
                                ),
                                traces: deserializedTraces,
                                deltas: deserializedDeltas
                            });
                        } catch (error) {
                            // abort reader if error is thrown
                            this.blocksQueue.clear();
                            this.blocksQueue.pause();

                            logger.error('Ship blocks queue stopped duo to an error at #' + response.this_block.block_num, error);

                            return;
                        }

                        this.unconfirmed += 1;

                        if (this.unconfirmed >= this.options.min_block_confirmation) {
                            this.send(['get_blocks_ack_request_v0', { num_messages: this.unconfirmed }]);
                            this.unconfirmed = 0;
                        }

                        if (response.this_block) {
                            this.currentArgs.start_block_num = response.this_block.block_num;
                        } else {
                            this.currentArgs.start_block_num += 1;
                        }
                    }).then();
                } else {
                    logger.warn('Not supported message received', {type, response});
                }
            }
        } catch (e) {
            logger.error(e);

            process.exit(1);
        }
    }

    async onClose(): Promise<void> {
        logger.error('Ship Websocket disconnected');

        if (this.ws) {
            await this.ws.terminate();
        }

        this.abi = null;
        this.types = null;
        this.tables = new Map();

        this.connected = false;
        this.connecting = false;

        if (this.deserializeWorkers) {
            await this.deserializeWorkers.destroy();
            this.deserializeWorkers = null;
        }

        this.blocksQueue.clear();

        this.reconnect();
    }

    requestBlocks(): void {
        this.unconfirmed = 0;

        this.send(['get_blocks_request_v0', this.currentArgs]);
    }

    startProcessing(request: BlockRequestType = {}, deltas: string[] = []): void {
        this.currentArgs = {
            start_block_num: 0,
            end_block_num: 0xffffffff,
            max_messages_in_flight: 1,
            have_positions: [],
            irreversible_only: false,
            fetch_block: false,
            fetch_traces: false,
            fetch_deltas: false,
            ...request
        };
        this.deltaWhitelist = deltas;
        this.stopped = false;

        if (this.connected && this.abi) {
            this.requestBlocks();
        }

        this.blocksQueue.start();

        this.connect();
    }

    stopProcessing(): void {
        this.stopped = true;

        this.ws.close();

        this.blocksQueue.clear();
        this.blocksQueue.pause();
    }

    async processBlock(block: ShipBlockResponse): Promise<void> {
        if (!block.this_block) {
            if (this.currentArgs.start_block_num >= this.currentArgs.end_block_num) {
                logger.warn(
                    'Empty block #' + this.currentArgs.start_block_num + ' received. Reader finished reading.'
                );
            } else if (this.currentArgs.start_block_num % 10000 === 0) {
                logger.warn(
                    'Empty block #' + this.currentArgs.start_block_num + ' received. ' +
                    'Node was likely started with a snapshot and you tried to process a block range ' +
                    'before the snapshot. Catching up until init block.'
                );
            }

            return;
        }

        if (this.consumer) {
            await this.consumer(block);
        }

        return;
    }

    consume(consumer: BlockConsumer): void {
        this.consumer = consumer;
    }

    private async deserializeParallel(type: string, data: Uint8Array): Promise<any> {
        const result = await this.deserializeWorkers.exec([{type, data}]);

        if (result.success) {
            return result.data[0];
        }

        throw new Error(result.message);
    }

    private async deserializeDeltas(data: Uint8Array): Promise<any> {
        const deltas = await this.deserializeParallel('table_delta[]', data);

        return await Promise.all(deltas.map(async (delta: any) => {
            if (delta[0] === 'table_delta_v0') {
                if (this.deltaWhitelist.indexOf(delta[1].name) >= 0) {
                    const deserialized = await this.deserializeWorkers.exec(delta[1].rows.map((row: any) => ({
                        type: delta[1].name, data: row.data
                    })));

                    if (!deserialized.success) {
                        throw new Error(deserialized.message);
                    }

                    return [
                        delta[0],
                        {
                            ...delta[1],
                            rows: delta[1].rows.map((row: any, index: number) => ({
                                ...row, data: deserialized.data[index]
                            }))
                        }
                    ];
                }

                return delta;
            }

            throw Error('Unsupported table delta type received ' + delta[0]);
        }));
    }
}
