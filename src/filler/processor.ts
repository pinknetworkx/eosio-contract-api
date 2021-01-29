import { ContractDBTransaction } from './database';
import { ShipBlock } from '../types/ship';
import { EosioActionTrace, EosioTableRow, EosioTransaction } from '../types/eosio';
import logger from '../utils/winston';

export type TraceListener = (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<any>) => Promise<any>;
export type DeltaListener = (db: ContractDBTransaction, block: ShipBlock, delta: EosioTableRow) => Promise<any>;
export type PriorityListener = (db: ContractDBTransaction) => Promise<any>;
export type CommitListener = (db: ContractDBTransaction) => Promise<any>;
export type CommittedListener = () => Promise<any>;

export type ListenerOptions = {
    deserialize?: boolean,
    headOnly?: boolean,
    irreversible_queue?: boolean
}

const defaultListenerOptions = {
    deserialize: true,
    headOnly: false,
    irreversible_queue: false // TODO add separate queue for irreversible data
};

export enum ProcessingState {
    HEAD = 0,
    CATCHUP = 1,
}

function matchFilter(val1: string, val2: string, filter1: string, filter2: string): boolean {
    let match1 = filter1 === '*';
    let match2 = filter2 === '*';

    if (!match1 && val1 === filter1) {
        match1 = true;
    }

    if (!match2 && val2 === filter2) {
        match2 = true;
    }

    return match1 && match2;
}

export default class DataProcessor {
    private readonly traceListeners: Array<{contract: string, action: string, callback: TraceListener, priority: number, options: ListenerOptions}>;
    private readonly deltaListeners: Array<{contract: string, table: string, callback: DeltaListener, priority: number, options: ListenerOptions}>;
    private readonly priorityListeners: Array<{callback: PriorityListener, threshold: number, priority: number}>;
    private readonly commitListeners: Array<{callback: CommitListener, priority: number}>;
    private readonly committedListeners: Array<{callback: CommittedListener, priority: number}>;

    private state: ProcessingState;

    private liveQueue: Array<{listener: {callback: any}, args: any[], priority: number, index: number}>;
    private irreversibleQueue: Array<{listener: {callback: any}, args: any[], priority: number, index: number}>;

    constructor(initialState: ProcessingState) {
        this.traceListeners = [];
        this.deltaListeners = [];
        this.commitListeners = [];

        this.priorityListeners = [];
        this.committedListeners = [];

        this.state = initialState;
        this.liveQueue = [];
    }

    setState(state: ProcessingState): void {
        this.state = state;
    }

    getState(): ProcessingState {
        return this.state;
    }

    onTrace(contract: string, action: string, listener: TraceListener, priority = 100, options: ListenerOptions = {}): () => void {
        const element = {
            contract, action, callback: listener, priority,
            options: {...defaultListenerOptions, ...options}
        };

        logger.debug('Trace listener registered', {contract, action, priority, options: element.options});

        this.traceListeners.push(element);

        return (): void => {
            const index = this.traceListeners.indexOf(element);

            if (index >= 0) {
                this.traceListeners.splice(index, 1);
            }
        };
    }

    onDelta(contract: string, table: string, listener: DeltaListener, priority = 100, options: ListenerOptions = {}): () => void {
        const element = {
            contract, table, callback: listener, priority,
            options: {...defaultListenerOptions, ...options}
        };

        logger.debug('Delta listener registered', {contract, table, priority, options: element.options});

        this.deltaListeners.push(element);

        return (): void => {
            const index = this.deltaListeners.indexOf(element);

            if (index >= 0) {
                this.deltaListeners.splice(index, 1);
            }
        };
    }

    onPriorityComplete(threshold: number, listener: PriorityListener, priority = 100): () => void {
        logger.debug('Priority listener registered', {threshold, priority});

        const element = {callback: listener, threshold, priority};

        this.priorityListeners.push(element);

        this.priorityListeners.sort((a, b) => {
            return a.priority - b.priority;
        });

        return (): void => {
            const index = this.priorityListeners.indexOf(element);

            if (index >= 0) {
                this.priorityListeners.splice(index, 1);
            }
        };
    }

    onCommit(listener: CommitListener, priority = 100): () => void {
        logger.debug('Commit listener registered', {priority});

        const element = {callback: listener, priority};

        this.commitListeners.push(element);

        this.commitListeners.sort((a, b) => {
            return a.priority - b.priority;
        });

        return (): void => {
            const index = this.commitListeners.indexOf(element);

            if (index >= 0) {
                this.commitListeners.splice(index, 1);
            }
        };
    }

    onCommitted(listener: CommittedListener, priority = 100): () => void {
        logger.debug('Committed listener registered', {priority});

        const element = {callback: listener, priority};

        this.committedListeners.push(element);

        this.committedListeners.sort((a, b) => {
            return a.priority - b.priority;
        });

        return (): void => {
            const index = this.committedListeners.indexOf(element);

            if (index >= 0) {
                this.committedListeners.splice(index, 1);
            }
        };
    }

    traceNeeded(contract: string, action: string): { process: boolean, deserialize: boolean } {
        const listeners = this.traceListeners
            .filter(element => this.state === ProcessingState.HEAD || !element.options.headOnly)
            .filter(element => matchFilter(contract, action, element.contract, element.action));

        return {
            process: listeners.length > 0,
            deserialize: !!listeners.find(element => element.options.deserialize)
        };
    }

    deltaNeeded(contract: string, table: string): { process: boolean, deserialize: boolean } {
        const listeners = this.deltaListeners
            .filter(element => this.state === ProcessingState.HEAD || !element.options.headOnly)
            .filter(element => matchFilter(contract, table, element.contract, element.table));

        return {
            process: listeners.length > 0,
            deserialize: !!listeners.find(element => element.options.deserialize)
        };
    }

    processTrace(block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<any>): void {
        for (const listener of this.traceListeners) {
            if (!matchFilter(trace.act.account, trace.act.name, listener.contract, listener.action)) {
                continue;
            }

            if (listener.options.headOnly && this.state !== ProcessingState.HEAD) {
                continue;
            }

            const element = {
                listener: listener, args: [block, tx, trace],
                priority: listener.priority, index: this.liveQueue.length + 1
            };

            if (this.state === ProcessingState.HEAD && listener.options.irreversible_queue) {
                this.irreversibleQueue.push(element);
            } else {
                this.liveQueue.push(element);
            }
        }
    }

    processDelta(block: ShipBlock, delta: EosioTableRow): void {
        for (const listener of this.deltaListeners) {
            if (!matchFilter(delta.code, delta.table, listener.contract, listener.table)) {
                continue;
            }

            if (listener.options.headOnly && this.state !== ProcessingState.HEAD) {
                continue;
            }

            const element = {
                listener: listener, args: [block, delta],
                priority: listener.priority, index: this.liveQueue.length + 1
            };

            if (this.state === ProcessingState.HEAD && listener.options.irreversible_queue) {
                this.irreversibleQueue.push(element);
            } else {
                this.liveQueue.push(element);
            }
        }
    }

    async dequeueLive(db: ContractDBTransaction): Promise<void> {
        const queue = this.liveQueue;
        this.liveQueue = [];

        queue.sort((a, b) => {
            if (a.priority === b.priority) {
                return a.index - b.index;
            }

            return a.priority - b.priority;
        });

        let lastPriority = -1;
        for (const job of queue) {
            if (lastPriority >= 0 && job.priority !== lastPriority) {
                for (const listener of this.priorityListeners) {
                    if (listener.threshold === lastPriority) {
                        await listener.callback(db);
                    }
                }
            }

            try {
                await job.listener.callback(...[db, ...job.args]);
            } catch (e) {
                logger.error('Error while processing data', job.args);

                throw e;
            }

            lastPriority = job.priority;
        }

        if (lastPriority >= 0) {
            for (const listener of this.priorityListeners) {
                if (listener.threshold === lastPriority) {
                    await listener.callback(db);
                }
            }
        }

        for (const listener of this.commitListeners) {
            await listener.callback(db);
        }
    }

    async dequeueIrreversible(db: ContractDBTransaction): Promise<void> {
        const queue = this.irreversibleQueue;
        this.irreversibleQueue = [];

        queue.sort((a, b) => {
            if (a.priority === b.priority) {
                return a.index - b.index;
            }

            return a.priority - b.priority;
        });

        for (const job of queue) {
            try {
                await job.listener.callback(...[db, ...job.args]);
            } catch (e) {
                logger.error('Error while processing data', job.args);

                throw e;
            }
        }
    }

    async notifyCommit(): Promise<void> {
        for (const listener of this.committedListeners) {
            await listener.callback();
        }
    }
}
