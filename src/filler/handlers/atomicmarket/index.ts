import { ContractHandler } from '../interfaces';
import { ShipBlock } from '../../../types/ship';
import { EosioActionTrace, EosioTableRow, EosioTransaction } from '../../../types/eosio';
import { ContractDBTransaction } from '../../database';
import ConnectionManager from '../../../connections/manager';
import { PromiseEventHandler } from '../../../utils/event';

export type AtomicMarketArgs = {
    atomicassets_account: string,
    atomicmarket_account: string
};

export default class AtomicAssetsHandler extends ContractHandler {
    static handlerName = 'atomicmarket';

    readonly args: AtomicMarketArgs;

    constructor(connection: ConnectionManager, events: PromiseEventHandler, args: {[key: string]: any}) {
        if (typeof args.atomicassets_account !== 'string') {
            throw new Error('Argument missing in atomicmarket handler: atomicassets_account');
        }

        if (typeof args.atomicmarket_account !== 'string') {
            throw new Error('Argument missing in atomicmarket handler: atomicmarket_account');
        }

        super(connection, events, args);

        this.scope = {
            actions: [
                {
                    filter: this.args.atomicmarket_account + ':*',
                    deserialize: true
                }
            ],
            tables: [
                {
                    filter: this.args.atomicmarket_account + ':*',
                    deserialize: true
                }
            ]
        };
    }

    async init(): Promise<void> {

    }

    async deleteDB(): Promise<void> {

    }

    async onAction(_db: ContractDBTransaction, _block: ShipBlock, _trace: EosioActionTrace, _tx: EosioTransaction): Promise<void> {

    }

    async onTableChange(_db: ContractDBTransaction, _block: ShipBlock, _delta: EosioTableRow): Promise<void> {

    }

    async onBlockComplete(_db: ContractDBTransaction, _block: ShipBlock): Promise<void> {

    }
}
