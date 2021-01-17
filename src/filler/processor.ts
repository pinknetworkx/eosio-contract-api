import PQueue from 'p-queue';

import { ContractDBTransaction } from './database';
import { ShipBlock } from '../types/ship';
import { EosioActionTrace, EosioTableRow, EosioTransaction } from '../types/eosio';

export type TraceListener = (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<any>) => Promise<any>;
export type DeltaListener = (db: ContractDBTransaction, block: ShipBlock, delta: EosioTableRow) => Promise<any>;
export type CommitListener = () => Promise<any>;

export enum ProcessingState {
    HEAD = 1,
    CATCHUP = 1,
}

function matchFilter(val1: string, val2: string, filter1: string, filter2: string): boolean {
    let match1 = filter1 === '*';
    let match2 = filter2 === '*';

    if (!filter1 && val1 === filter1) {
        match1 = true;
    }

    if (!filter2 && val2 === filter2) {
        match2 = true;
    }

    return match1 && match2;
}

export default class DataProcessor {
    private readonly traceListeners: Array<{contract: string, action: string, callback: TraceListener, priority: number}>;
    private readonly deltaListeners: Array<{contract: string, table: string, callback: DeltaListener, priority: number}>;
    private readonly commitListeners: Array<{callback: CommitListener, priority: number}>;

    private state: ProcessingState;
    private queue: PQueue;

    constructor(initialState: ProcessingState) {
        this.traceListeners = [];
        this.deltaListeners = [];
        this.commitListeners = [];

        this.state = initialState;
        this.queue = new PQueue({concurrency: 1, autoStart: false});
    }

    setState(state: ProcessingState): void {
        this.state = state;
    }

    onTrace(contract: string, action: string, listener: TraceListener, priority = 100): () => void {
        const element = {contract, action, callback: listener, priority};

        this.traceListeners.push(element);

        return (): void => {
            const index = this.traceListeners.indexOf(element);

            if (index >= 0) {
                this.traceListeners.splice(index, 1);
            }
        };
    }

    onDelta(contract: string, table: string, listener: DeltaListener, priority = 100): () => void {
        const element = {contract, table, callback: listener, priority};

        this.deltaListeners.push(element);

        return (): void => {
            const index = this.deltaListeners.indexOf(element);

            if (index >= 0) {
                this.deltaListeners.splice(index, 1);
            }
        };
    }

    onCommit(listener: CommitListener, priority = 100): () => void {
        const element = {callback: listener, priority};

        this.commitListeners.push(element);

        this.commitListeners.sort((a, b) => {
            return b.priority - a.priority;
        });

        return (): void => {
            const index = this.commitListeners.indexOf(element);

            if (index >= 0) {
                this.commitListeners.splice(index, 1);
            }
        };
    }

    traceNeeded(contract: string, action: string): boolean {
        return !!this.traceListeners.find(element => matchFilter(contract, action, element.contract, element.action));
    }

    deltaNeeded(contract: string, table: string): boolean {
        return !!this.deltaListeners.find(element => matchFilter(contract, table, element.contract, element.table));
    }

    processTrace(db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<any>): void {
        for (const listener of this.traceListeners) {
            if (!matchFilter(trace.act.account, trace.act.name, listener.contract, listener.action)) {
                continue;
            }

            this.queue.add(async () => listener.callback(db, block, tx, trace), {priority: listener.priority}).then();
        }
    }

    processDelta(db: ContractDBTransaction, block: ShipBlock, delta: EosioTableRow): void {
        for (const listener of this.deltaListeners) {
            if (!matchFilter(delta.code, delta.table, listener.contract, listener.table)) {
                continue;
            }

            this.queue.add(async () => listener.callback(db, block, delta), {priority: listener.priority}).then();
        }
    }

    async execute(): Promise<void> {
        this.queue.start();

        await this.queue.onIdle();

        for (const listener of this.commitListeners) {
            await listener.callback();
        }

        this.queue.pause();
    }
}
