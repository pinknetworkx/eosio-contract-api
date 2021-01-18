import { PoolClient } from 'pg';

import ConnectionManager from '../../connections/manager';
import { PromiseEventHandler } from '../../utils/event';
import { ContractDBTransaction } from '../database';
import { ShipBlock } from '../../types/ship';
import { EosioActionTrace, EosioTableRow, EosioTransaction } from '../../types/eosio';
import StateReceiver from '../receiver';
import DataProcessor from '../processor';

export type ContractHandlerScope = {[key: string]: Array<{ filter: string, deserialize: boolean }>};

export abstract class ContractHandler {
    static handlerName = '';

    scope: ContractHandlerScope = {};

    readonly connection: ConnectionManager;
    readonly events: PromiseEventHandler;

    protected constructor(
        readonly reader: StateReceiver,
        readonly args: {[key: string]: any}
    ) {
        this.connection = reader.connection;
    }

    abstract async init(transaction: PoolClient): Promise<void>;
    abstract async deleteDB(transaction: PoolClient): Promise<void>;

    abstract async register(processor: DataProcessor): Promise<() => void>;

    abstract async onAction(db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace, tx: EosioTransaction): Promise<void>;
    abstract async onTableChange(db: ContractDBTransaction, block: ShipBlock, delta: EosioTableRow): Promise<void>;
    abstract async onBlockStart(db: ContractDBTransaction, block: ShipBlock): Promise<void>;
    abstract async onBlockComplete(db: ContractDBTransaction, block: ShipBlock): Promise<void>;
    abstract async onCommit(block: ShipBlock): Promise<void>;
}
