import { Serialize } from 'eosjs';

import logger from "../utils/winston";

const { TextDecoder, TextEncoder } = require('text-encoding');
const WebSocket = require('ws');

export default class StateHistoryConnection {
    private ws: any;

    private connected: boolean;
    private connecting: boolean;

    private inProcessBlocks: boolean;

    private abi: any;
    private types: any;
    private tables: any;
    private blocksQueue: any;
    private currentArgs: any;

    constructor(private readonly shipEndpoint: string) {
        this.connected = false;
        this.connecting = false;

        this.abi = null;
        this.types = null;
        this.tables = new Map();
        this.blocksQueue = [];
        this.inProcessBlocks = false;
        this.currentArgs = null;

        this.connect();
    }

    connect(): void {
        if (!this.connected && !this.connecting) {
            logger.info(`Websocket connecting to ${this.shipEndpoint}`);

            this.connecting = true;

            this.ws = new WebSocket(this.shipEndpoint, { perMessageDeflate: false });

            this.ws.on('open', () => this.onConnect());
            this.ws.on('message', (data: any) => this.onMessage(data));
            this.ws.on('close', () => this.onClose());
            this.ws.on('error', (e: Error) => { logger.error(`Websocket error`, e); });
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
            throw new Error('oops: ' + type);
        }

        return result;
    }

    send(request: [string, any]): void {
        logger.debug("WebSocket send", request);

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
            } else {
                const [type, response] = this.deserialize('result', data);

                logger.debug('Websocket message received', {type, response});

                if (type === 'get_blocks_result_v0') {
                    this.blocksQueue.push(response);
                    this.processBlocks();
                }
            }
        } catch (e) {
            logger.error(e);

            process.exit(1);
        }
    }

    onClose(): void {
        console.error(`Websocket disconnected`);

        this.ws.terminate();

        this.abi = null;
        this.types = null;
        this.tables = new Map;
        this.blocksQueue = [];
        this.inProcessBlocks = false;
        this.connected = false;
        this.connecting = false;

        this.reconnect();

    }

    onOpen(): void {
        //this.requestBlocks(this.currentArgs);
    }

    requestStatus(): void {
        this.send(['get_status_request_v0', {}]);
    }

    requestBlocks(requestArgs: object): void {
        if (!this.currentArgs) {
            this.currentArgs = {
                start_block_num: 0,
                end_block_num: 0xffffffff,
                max_messages_in_flight: 10,
                have_positions: [],
                irreversible_only: false,
                fetch_block: false,
                fetch_traces: false,
                fetch_deltas: false,
                ...requestArgs
            };
        }

        this.send(['get_blocks_request_v0', this.currentArgs]);
    }

    async processBlocks(): Promise<void> {
        if (this.inProcessBlocks) {
            return;
        }

        this.inProcessBlocks = true;

        while (this.blocksQueue.length) {
            const response = this.blocksQueue.shift();

            if (response.this_block) {
                const block_num = response.this_block.block_num;

                this.currentArgs.start_block_num = block_num - 50;
            }

            //this.send(['get_blocks_ack_request_v0', { num_messages: 1 }]);

            let block, traces = [], deltas = [];

            if (this.currentArgs.fetch_block && response.block && response.block.length) {
                block = this.deserialize('signed_block', response.block);
            }

            if (this.currentArgs.fetch_traces && response.traces && response.traces.length) {
                traces = this.deserialize('transaction_trace[]', response.traces);
            }

            if (this.currentArgs.fetch_deltas && response.deltas && response.deltas.length) {
                deltas = this.deserialize('table_delta[]', response.deltas);
            }

            logger.info('received block', {block, traces, deltas});
            // await this.receivedBlock(response, block, traces, deltas);
        }

        this.inProcessBlocks = false;
    }
}
