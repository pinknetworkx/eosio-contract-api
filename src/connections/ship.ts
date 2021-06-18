import PQueue from 'p-queue';
import { Serialize } from 'eosjs';
import { Abi } from 'eosjs/dist/eosjs-rpc-interfaces';
import * as WebSocket from 'ws';
import { StaticPool } from 'node-worker-threads-pool';

import logger from '../utils/winston';
import {
    BlockRequestType,
    IBlockReaderOptions, ShipBlockResponse
} from '../types/ship';
import { eosioDeserialize, eosioSerialize } from '../utils/eosio';

export type BlockConsumer = (block: ShipBlockResponse) => any;

export default class StateHistoryBlockReader {
    currentArgs: BlockRequestType;
    deltaWhitelist: string[];

    abi: Abi;
    types: Map<string, Serialize.Type>;
    tables: Map<string, string>;

    blocksQueue: PQueue;

    private ws: any;

    private connected: boolean;
    private connecting: boolean;
    private stopped: boolean;

    private deserializeWorkers: StaticPool<(x: Array<{type: string, data: Uint8Array, abi?: any}>) => any>;

    private unconfirmed: number;
    private consumer: BlockConsumer;

    constructor(
        private readonly endpoint: string,
        private options: IBlockReaderOptions = {min_block_confirmation: 1, ds_threads: 4, allow_empty_deltas: false, allow_empty_traces: false, allow_empty_blocks: false}
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
        if (this.stopped) {
            return;
        }

        logger.info('Reconnecting to Ship...');

        setTimeout(() => {
            this.connect();
        }, 5000);
    }

    send(request: [string, any]): void {
        this.ws.send(eosioSerialize('request', request, this.types));
    }

    onConnect(): void {
        this.connected = true;
        this.connecting = false;
    }

    onMessage(data: any): void {
        try {
            if (!this.abi) {
                logger.info('Receiving ABI from ship...');

                this.abi = JSON.parse(data);
                this.types = Serialize.getTypesFromAbi(Serialize.createInitialTypes(), this.abi);

                this.deserializeWorkers = new StaticPool({
                    size: this.options.ds_threads,
                    task: './build/workers/deserializer.js',
                    workerData: {abi: data}
                });

                for (const table of this.abi.tables) {
                    this.tables.set(table.name, table.type);
                }

                if (!this.stopped) {
                    this.requestBlocks();
                }
            } else {
                const [type, response] = eosioDeserialize('result', data, this.types);

                if (type === 'get_blocks_result_v0') {
                    let block: any = null;
                    let traces: any = [];
                    let deltas: any = [];

                    if (response.this_block) {
                        if (response.block) {
                            block = this.deserializeParallel('signed_block', response.block);
                        } else if(this.currentArgs.fetch_block) {
                            if (this.options.allow_empty_blocks) {
                                logger.warn('Block #' + response.this_block.block_num + ' does not contain block data');
                            } else {
                                logger.error('Block #' + response.this_block.block_num + ' does not contain block data');

                                return this.blocksQueue.pause();
                            }
                        }

                        if (response.traces) {
                            traces = this.deserializeParallel('transaction_trace[]', response.traces);
                        } else if(this.currentArgs.fetch_traces) {
                            if (this.options.allow_empty_traces) {
                                logger.warn('Block #' + response.this_block.block_num + ' does not contain trace data');
                            } else {
                                logger.error('Block #' + response.this_block.block_num + ' does not contain trace data');

                                return this.blocksQueue.pause();
                            }
                        }

                        if (response.deltas) {
                            deltas = this.deserializeDeltas(response.deltas);
                        } else if(this.currentArgs.fetch_deltas) {
                            if (this.options.allow_empty_deltas) {
                                logger.warn('Block #' + response.this_block.block_num + ' does not contain delta data');
                            } else {
                                logger.error('Block #' + response.this_block.block_num + ' does not contain delta data');

                                return this.blocksQueue.pause();
                            }
                        }
                    }

                    this.blocksQueue.add(async () => {
                        let deserializedTraces = [];
                        let deserializedDeltas = [];

                        try {
                            deserializedTraces = await traces;
                        } catch (error) {
                            logger.error('Failed to deserialize traces at block #' + response.this_block.block_num, error);

                            this.blocksQueue.clear();
                            this.blocksQueue.pause();

                            throw error;
                        }

                        try {
                            deserializedDeltas = await deltas;
                        } catch (error) {
                            logger.error('Failed to deserialize deltas at block #' + response.this_block.block_num, error);

                            this.blocksQueue.clear();
                            this.blocksQueue.pause();

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
                            logger.error('Ship blocks queue stopped duo to an error at #' + response.this_block.block_num, error);

                            this.blocksQueue.clear();
                            this.blocksQueue.pause();

                            throw error;
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

            this.ws.close();
        }
    }

    async onClose(): Promise<void> {
        logger.error('Ship Websocket disconnected');

        if (this.ws) {
            await this.ws.terminate();
            this.ws = null;
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
