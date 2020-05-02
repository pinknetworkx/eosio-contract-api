import { Serialize } from 'eosjs';
import PQueue from 'p-queue';
import { BlockRequestType, BlockResponseType, TraceResponseType, DeltaResponseType, IBlockReaderOptions } from '../types/ship';

import logger from '../utils/winston';

const { TextDecoder, TextEncoder } = require('text-encoding');
const WebSocket = require('ws');

export default class StateHistoryBlockReader {
    private ws: any;

    private connected: boolean;
    private connecting: boolean;
    private started: boolean;

    private blocksQueue: PQueue;
    private unconfirmed: number;
    private consumer: (block: BlockResponseType, traces: TraceResponseType[], deltas: DeltaResponseType[]) => any;

    private currentArgs: BlockRequestType;

    private abi: any;
    private types: any;
    private tables: any;

    constructor(
        private readonly endpoint: string,
        private readonly options: IBlockReaderOptions = {min_block_confirmation: 1}
    ) {
        this.connected = false;
        this.connecting = false;
        this.started = false;

        this.blocksQueue = new PQueue({concurrency: 1, autoStart: true});
        this.consumer = null;

        this.abi = null;
        this.types = null;
        this.tables = new Map();

        this.connect();
    }

    connect(): void {
        if (!this.connected && !this.connecting) {
            logger.info(`Websocket connecting to ${this.endpoint}`);

            this.connecting = true;

            this.ws = new WebSocket(this.endpoint, { perMessageDeflate: false });

            this.ws.on('open', () => this.onConnect());
            this.ws.on('message', (data: any) => this.onMessage(data));
            this.ws.on('close', () => this.onClose());
            this.ws.on('error', (e: Error) => { logger.error('Websocket error', e); });
        }
    }

    reconnect(): void {
        logger.info(`Reconnecting to State History...`);

        setTimeout(() => {
            this.connect();
        }, 5000);
    }

    serialize(type: string, value: any): Uint8Array {
        const buffer = new Serialize.SerialBuffer({ textEncoder: new TextEncoder, textDecoder: new TextDecoder });
        Serialize.getType(this.types, type).serialize(buffer, value);

        return buffer.asUint8Array();
    }

    deserialize(type: string, array: any): any {
        const buffer = new Serialize.SerialBuffer({ textEncoder: new TextEncoder, textDecoder: new TextDecoder, array });
        const result = Serialize.getType(this.types, type).deserialize(buffer, new Serialize.SerializerState({ bytesAsUint8Array: true }));

        if (buffer.readPos !== array.length) {
            throw new Error('Deserialization error: ' + type);
        }

        return result;
    }

    send(request: [string, any]): void {
        logger.debug('WebSocket send', request);

        this.ws.send(this.serialize('request', request));
    }

    onConnect(): void {
        this.connected = true;
        this.connecting = false;
    }

    onMessage(data: any): void {
        try {
            if (!this.abi) {
                logger.info('receiving abi');

                this.abi = JSON.parse(data);
                this.types = Serialize.getTypesFromAbi(Serialize.createInitialTypes(), this.abi);

                for (const table of this.abi.tables) {
                    this.tables.set(table.name, table.type);
                }

                if (this.started) {
                    this.requestBlocks();
                }
            } else {
                const [type, response] = this.deserialize('result', data);

                logger.debug('Websocket message received', {type, response});

                if (type === 'get_blocks_result_v0') {
                    this.blocksQueue.add(async () => {
                        await this.processBlock(response);

                        this.unconfirmed += 1;

                        if (this.unconfirmed >= this.options.min_block_confirmation) {
                            this.send(['get_blocks_ack_request_v0', { num_messages: this.unconfirmed }]);
                            this.unconfirmed = 0;
                        }

                        this.currentArgs.start_block_num = response.this_block.block_num;
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

        if (!this.started && this.connected && this.abi) {
            this.requestBlocks();
        }

        this.started = true;
    }

    async processBlock(response: any): Promise<void> {
        let block = null, traces = [], deltas = [];

        if (this.currentArgs.fetch_block && response.block && response.block.length) {
            block = this.deserialize('signed_block', response.block);
        }

        if (this.currentArgs.fetch_traces && response.traces && response.traces.length) {
            traces = this.deserialize('transaction_trace[]', response.traces);
        }

        if (this.currentArgs.fetch_deltas && response.deltas && response.deltas.length) {
            deltas = this.deserialize('table_delta[]', response.deltas);
        }

        logger.debug('received block', {block, traces, deltas});

        if (this.consumer) {
            await this.consumer(block, traces, deltas);
        }
    }

    consume(consumer: (block: BlockResponseType, traces: TraceResponseType[], deltas: DeltaResponseType[]) => any): void {
        this.consumer = consumer;
    }
}
