import { PoolClient } from 'pg';

import ConnectionManager from '../../connections/manager';
import { PromiseEventHandler } from '../../utils/event';
import { ContractDBTransaction } from '../database';
import { ShipBlock } from '../../types/ship';
import { EosioActionTrace, EosioTableRow, EosioTransaction } from '../../types/eosio';

export type ContractHandlerScope = {[key: string]: Array<{ filter: string, deserialize: boolean }>};

export abstract class ContractHandler {
    static handlerName = '';

    scope: ContractHandlerScope = {};

    protected constructor(
        readonly connection: ConnectionManager,
        readonly events: PromiseEventHandler,
        readonly args: {[key: string]: any},
        readonly minBlock: number = 0
    ) { }

    abstract async init(): Promise<void>;
    abstract async deleteDB(transaction: PoolClient): Promise<void>;

    abstract async onAction(db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace, tx: EosioTransaction): Promise<void>;
    abstract async onTableChange(db: ContractDBTransaction, block: ShipBlock, delta: EosioTableRow): Promise<void>;
    abstract async onBlockComplete(db: ContractDBTransaction, block: ShipBlock): Promise<void>;
    abstract async onCommit(): Promise<void>;
}
