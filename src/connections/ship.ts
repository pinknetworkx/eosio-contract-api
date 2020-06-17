import PQueue from 'p-queue';
import { Serialize } from 'eosjs';
import { Abi } from 'eosjs/dist/eosjs-rpc-interfaces';
import * as WebSocket from 'ws';
import { TextDecoder, TextEncoder } from 'text-encoding';
import { StaticPool } from 'node-worker-threads-pool';

import logger from '../utils/winston';
import {
    BlockRequestType,
    IBlockReaderOptions, ShipBlockResponse
} from '../types/ship';

export type BlockConsumer = (block: ShipBlockResponse) => any;

export default class StateHistoryBlockReader {
    abi: Abi;
    types: Map<string, Serialize.Type>;
    tables: Map<string, string>;

    private ws: any;

    private connected: boolean;
    private connecting: boolean;
    private stopped: boolean;

    private blocksQueue: PQueue;
    private deserializeWorkers: StaticPool;

    private unconfirmed: number;
    private consumer: BlockConsumer;

    private currentArgs: BlockRequestType;

    constructor(
        private readonly endpoint: string,
        private options: IBlockReaderOptions = {min_block_confirmation: 1, ds_threads: 4}
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
    }

    setOptions(options: IBlockReaderOptions): void {
        this.options = {...this.options, ...options};
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
        logger.info(`Reconnecting to Ship...`);

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

    deserialize(type: string, data: any, types?: Map<string, Serialize.Type>, checkLength: boolean = true): any {
        let serializeTypes: Map<string, Serialize.Type>;

        if (types) {
            serializeTypes = types;
        } else {
            serializeTypes = this.types;
        }

        const buffer = new Serialize.SerialBuffer({ textEncoder: new TextEncoder, textDecoder: new TextDecoder, array: data });
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
                    workerData: this.abi
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
                    const blockData = this.deserializeWorkers.exec(response);

                    this.blocksQueue.add(async () => {
                        try {
                            await this.processBlock(await blockData);
                        } catch (e) {
                            // abort reader if error is thrown
                            this.blocksQueue.clear();
                            this.blocksQueue.pause();

                            throw e;
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
        console.error(`Websocket disconnected`);

        await this.ws.terminate();

        this.abi = null;
        this.types = null;
        this.tables = new Map();

        this.connected = false;
        this.connecting = false;

        this.blocksQueue.clear();

        this.reconnect();
    }

    requestBlocks(): void {
        this.unconfirmed = 0;

        this.send(['get_blocks_request_v0', this.currentArgs]);
    }

    startProcessing(request: BlockRequestType = {}): void {
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
}
