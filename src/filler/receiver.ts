import { Serialize } from 'eosjs';
import { Abi } from 'eosjs/dist/eosjs-rpc-interfaces';

import logger from '../utils/winston';
import ConnectionManager from '../connections/manager';
import StateHistoryBlockReader from '../connections/ship';
import { IContractConfig } from '../types/config';
import { ShipActionTrace, ShipBlock, ShipHeader, ShipTableDelta, ShipTransactionTrace } from '../types/ship';
import { EosioAction } from '../types/eosio';
import { ContractDB, ContractDBTransaction } from './database';

class StateReceiver {
    private readonly ship: StateHistoryBlockReader;
    private readonly database: ContractDB;

    private readonly abis: {[key: string]: {
        types: Map<string, Serialize.Type>,
        block_num: number,
        json: Abi
    }};

    private currentBlock = 0;

    constructor(readonly name: string, private readonly connection: ConnectionManager, private readonly config: IContractConfig[]) {
        this.ship = connection.createShipBlockReader();
        this.database = new ContractDB(name, this.connection);
        this.abis = {};

        this.ship.consume(this.consumer.bind(this));

        this.database.getReaderPosition().then((blockNum: number) => {
            this.ship.startProcessing({
                start_block_num: blockNum,
                max_messages_in_flight: parseInt(process.env.SHIP_PREFETCH_BLOCKS, 10) || 10,
                fetch_block: true,
                fetch_traces: true,
                fetch_deltas: true
            });
        }).catch(e => {
            logger.error('error while fetching starting block', e);
        });
    }

    private async consumer(
        header: ShipHeader,
        block: ShipBlock,
        traces: ShipTransactionTrace[],
        deltas: ShipTableDelta[]
    ): Promise<void> {
        let processDeltas = !!process.env.USE_SNAPSHOT && this.currentBlock === 0;

        const db = await this.database.startTransaction(header.this_block.block_num, header.last_irreversible.block_num);

        if (header.this_block.block_num <= this.currentBlock) {
            await db.applyForkDatabase(header.this_block.block_num);
        }

        for (const transactionTrace of traces) {
            processDeltas = await this.handleTransactionTrace(db, block, transactionTrace) || processDeltas;
        }

        if (processDeltas) {
            for (const tableDelta of deltas) {
                await this.handleTableDelta(db, block, tableDelta);
            }

            await db.updateReaderPosition(header.this_block.block_num);
            await db.clearForkDatabase(header.last_irreversible.block_num);
        }

        this.currentBlock = header.this_block.block_num;

        if (header.last_irreversible.block_num % 100 === 0) {
            await db.updateReaderPosition(header.this_block.block_num);
        }

        await db.commit();
    }

    private async handleTransactionTrace(
        db: ContractDBTransaction, block: ShipBlock, transactionTrace: ShipTransactionTrace
    ): Promise<boolean> {
        if (transactionTrace[0] === 'transaction_trace_v0') {
            let processDeltas = false;

            for (const actionTrace of transactionTrace[1].action_traces) {
                processDeltas = await this.handleActionTrace(db, block, actionTrace) || processDeltas;
            }

            return processDeltas;
        }

        await db.abort();

        throw Error('unsupported transaction response received: ' + transactionTrace[0]);
    }

    private async handleActionTrace(
        db: ContractDBTransaction, block: ShipBlock, actionTrace: ShipActionTrace
    ): Promise<boolean> {
        if (actionTrace[0] === 'action_trace_v0') {
            if (this.isActionInScope(actionTrace[1].act.account, actionTrace[1].act.name)) {
                const types = await this.fetchContractTypes(actionTrace[1].act.account, block);
                const data = this.ship.deserialize(actionTrace[1].act.name, actionTrace[1].act.data, types);

                await this.handleAction(block, {
                    account: actionTrace[1].act.account,
                    name: actionTrace[1].act.name,
                    authorization: actionTrace[1].act.authorization,
                    data
                });
            }

            return this.isContractInScope(actionTrace[1].act.account);
        }

        await db.abort();

        throw Error('unsupported trace response received: ' + actionTrace[0]);
    }

    private async handleTableDelta(db: ContractDBTransaction, block: ShipBlock, delta: ShipTableDelta): Promise<void> {
        if (delta[0] === 'table_delta_v0') {
            // TODO actual handle table deltas
        }

        await db.abort();

        throw Error('unsupported table delta response received: ' + delta[0]);
    }

    private async handleAction(block: ShipBlock, action: EosioAction): Promise<void> {
        if (action.account === 'eosio') {
            if (action.name === 'setcode') {
                await this.handleCodeUpdate(block, action);
            } else if (action.name === 'setabi') {
                await this.handleAbiUpdate(block, action);
            }
        }

        console.log('action', action);
    }

    private async handleAbiUpdate(block: ShipBlock, action: EosioAction): Promise<void> {
        const abiJson = this.connection.chain.deserializeAbi(action.data.abi);
        const types = Serialize.getTypesFromAbi(Serialize.createInitialTypes(), abiJson);

        this.abis[action.data.account] = { json: abiJson, types, block_num: block.block_num };

        // TODO: save abi to database

        logger.info('ABI updated for contract ' + action.data.account);
    }

    private async handleCodeUpdate(block: ShipBlock, action: EosioAction): Promise<void> {
        // TODO insert in code update log

        logger.info('Code updated for contract ' + action.data.account);
    }

    private async fetchContractTypes(contract: string, block: ShipBlock): Promise<Map<string, Serialize.Type>> {
        if (this.abis[contract] && this.abis[contract].block_num <= block.block_num) {
            return this.abis[contract].types;
        }

        let abiJson: Abi, abiBlock;

        const rawAbi = await this.database.fetchAbi(contract, block.block_num);

        if (rawAbi) {
            abiJson = this.connection.chain.deserializeAbi(rawAbi.data);
            abiBlock = rawAbi.block_num;
        } else {
            abiJson = (await this.connection.chain.rpc.get_abi(contract)).abi;
            abiBlock = block.block_num;
        }

        const types = Serialize.getTypesFromAbi(Serialize.createInitialTypes(), abiJson);

        if (!this.abis[contract] || this.abis[contract].block_num <= abiBlock) {
            this.abis[contract] = { json: abiJson, types, block_num: abiBlock };
        }

        return types;
    }

    private isActionInScope(contract: string, action: string): boolean {
        if (contract === 'eosio' && action === 'setcode') {
            return true;
        } else if (contract === 'eosio' && action === 'setabi') {
            return true;
        }

        return true;
    }

    private isContractInScope(contract: string): boolean {
        return true;
    }

    private getActionHandlers(): string[] {
        return [];
    }
}
