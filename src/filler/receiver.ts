import { Serialize } from 'eosjs';
import { Abi } from 'eosjs/dist/eosjs-rpc-interfaces';

import logger from '../utils/winston';
import ConnectionManager from '../connections/manager';
import StateHistoryBlockReader from '../connections/ship';
import { IReaderConfig } from '../types/config';
import { ShipActionTrace, ShipBlock, ShipContractRow, ShipHeader, ShipTableDelta, ShipTransactionTrace } from '../types/ship';
import { EosioAction } from '../types/eosio';
import { ContractDB, ContractDBTransaction } from './database';
import { IContractHandler } from './handlers';

export default class StateReceiver {
    private readonly ship: StateHistoryBlockReader;
    private readonly database: ContractDB;

    private readonly abis: {[key: string]: {
        types: Map<string, Serialize.Type>,
        block_num: number,
        json: Abi
    }};

    private currentBlock = 0;

    constructor(
        private readonly config: IReaderConfig,
        private readonly connection: ConnectionManager,
        private readonly handlers: IContractHandler[]
    ) {
        this.ship = connection.createShipBlockReader({
            min_block_confirmation: config.ship_min_block_confirmation
        });

        this.database = new ContractDB(this.config.name, this.connection);
        this.abis = {};

        this.ship.consume(this.consumer.bind(this));
    }

    async startProcessing(): Promise<void> {
        let startBlock = await this.database.getReaderPosition();

        if (this.config.start_block > 0 && this.config.start_block < startBlock) {
            throw new Error('Reader start block cannot be lower than the last processed block');
        }

        startBlock = Math.max(startBlock, this.config.start_block);

        this.ship.startProcessing({
            start_block_num: startBlock,
            max_messages_in_flight: this.config.ship_prefetch_blocks || 10,
            fetch_block: true,
            fetch_traces: true,
            fetch_deltas: true
        });
    }

    private async consumer(
        header: ShipHeader,
        block: ShipBlock,
        traces: ShipTransactionTrace[],
        deltas: ShipTableDelta[]
    ): Promise<void> {
        let processDeltas = this.config.start_from_snapshot && this.currentBlock === 0;

        const db = await this.database.startTransaction(header.this_block.block_num, header.last_irreversible.block_num);

        if (header.this_block.block_num <= this.currentBlock) {
            await db.applyForkDatabase(header.this_block.block_num);
        }

        for (const transactionTrace of traces) {
            processDeltas = await this.handleTransactionTrace(db, block, transactionTrace) || processDeltas;
        }

        // TODO remove true in condition
        if (processDeltas || true) {
            for (const tableDelta of deltas) {
                await this.handleTableDelta(db, block, tableDelta);
            }

            await db.updateReaderPosition(header.this_block.block_num);
            await db.clearForkDatabase(header.last_irreversible.block_num);
        } else if (header.this_block.block_num >= header.last_irreversible.block_num) {
            // always update reader position when in live reader mode
            await db.updateReaderPosition(header.this_block.block_num);
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
            if (transactionTrace[1].error_code) {
                logger.warn('Failed transaction ' + transactionTrace[1].id + ' received from ship');

                return false;
            }

            let processDeltas = false;

            for (const actionTrace of transactionTrace[1].action_traces) {
                processDeltas = await this.handleActionTrace(db, block, actionTrace) || processDeltas;
            }

            return processDeltas;
        }

        await db.abort();

        throw new Error('unsupported transaction response received: ' + transactionTrace[0]);
    }

    private async handleActionTrace(
        db: ContractDBTransaction, block: ShipBlock, actionTrace: ShipActionTrace
    ): Promise<boolean> {
        if (actionTrace[0] === 'action_trace_v0') {
            if (this.isActionInScope(actionTrace[1].act.account, actionTrace[1].act.name)) {
                const types = await this.fetchContractTypes(actionTrace[1].act.account, block);

                let data;

                // save hex data if ABI does not exist for contract
                if (types === null) {
                    data = '';
                    let i = 0;

                    while (typeof actionTrace[1].act.data[String(i)] === 'number') {
                        data += ('0' + (actionTrace[1].act.data[String(i)] & 0xFF).toString(16)).slice(-2);

                        i++;
                    }
                } else {
                    data = this.ship.deserialize(actionTrace[1].act.name, actionTrace[1].act.data, types);
                }

                await this.handleAction(db, block, {
                    account: actionTrace[1].act.account,
                    name: actionTrace[1].act.name,
                    authorization: actionTrace[1].act.authorization,
                    data
                });
            }

            return this.isContractInScope(actionTrace[1].act.account);
        }

        await db.abort();

        throw new Error('unsupported trace response received: ' + actionTrace[0]);
    }

    private async handleTableDelta(db: ContractDBTransaction, block: ShipBlock, delta: ShipTableDelta): Promise<void> {
        if (delta[0] === 'table_delta_v0') {
            const blacklist = ['resource_usage', 'resource_limits_state', 'account_metadata', 'contract_index64'];
            const whitelist = ['contract_row'];

            if (whitelist.indexOf(delta[1].name) >= 0) {
                const rows = delta[1].rows.map((row) => {
                    return {
                        present: row.present,
                        data: this.ship.deserialize(delta[1].name, row.data, this.ship.types)
                    };
                });

                if (delta[1].name === 'contract_row') {
                    for (const row of rows) {
                        await this.handleContractRow(db, block, row.data);
                    }
                }
            } else if (blacklist.indexOf(delta[1].name) === -1) {
                logger.warn('Unknown table delta received: ' + delta[1].name);
            }

            return;
        }

        await db.abort();

        throw new Error('unsupported table delta response received: ' + delta[0]);
    }

    private async handleContractRow(db: ContractDBTransaction, block: ShipBlock, contractRow: ShipContractRow): Promise<void> {
        if (contractRow[0] === 'contract_row_v0') {
            // TODO: add filter again
            /*if (!this.isContractInScope(row.data.code)) {
                continue;
            }*/

            const types = await this.fetchContractTypes(contractRow[1].code, block);
            const data = this.ship.deserialize(contractRow[1].table, contractRow[1].value, types);

            console.log(data);

            return;
        }

        await db.abort();

        throw new Error('unsupported contract row response received: ' + contractRow[0]);
    }

    private async handleAction(db: ContractDBTransaction, block: ShipBlock, action: EosioAction): Promise<void> {
        if (action.account === 'eosio') {
            if (action.name === 'setcode') {
                await this.handleCodeUpdate(db, block, action);
            } else if (action.name === 'setabi') {
                await this.handleAbiUpdate(db, block, action);
            }
        }

        const handlers = this.getActionHandlers(action.account, action.name);

        for (const handler of handlers) {
            await handler.onAction(db, block, action);
        }
    }

    private async handleAbiUpdate(db: ContractDBTransaction, block: ShipBlock, action: EosioAction): Promise<void> {
        if (typeof action.data !== 'string') {
            const abiJson = this.connection.chain.deserializeAbi(action.data.abi);
            const types = Serialize.getTypesFromAbi(Serialize.createInitialTypes(), abiJson);

            this.abis[action.data.account] = { json: abiJson, types, block_num: block.block_num };

            // TODO: save abi to database
            const buffer = action.data.abi;

            logger.info('ABI updated for contract ' + action.data.account);
        } else {
            logger.error('could not update ABI for contract because action could not be deserialized');
        }
    }

    private async handleCodeUpdate(db: ContractDBTransaction, block: ShipBlock, action: EosioAction): Promise<void> {
        if (typeof action.data !== 'string') {
            // TODO insert in code update log

            logger.info('Code updated for contract ' + action.data.account);
        } else {
            logger.error('could not update contract code because action could not be deserialized');
        }
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
            logger.warn('Could not find ABI for ' + contract + ' in cache, so requesting it...');

            abiJson = (await this.connection.chain.rpc.get_abi(contract)).abi;
            abiBlock = block.block_num;
        }

        const types = abiJson ? Serialize.getTypesFromAbi(Serialize.createInitialTypes(), abiJson) : null;

        if (types === null) {
            logger.warn('ABI for contract ' + contract + ' not found');
        }

        if (!this.abis[contract] || this.abis[contract].block_num <= abiBlock) {
            this.abis[contract] = { json: abiJson, types, block_num: abiBlock };
        }

        return types;
    }

    private isActionInScope(contract: string, action: string): boolean {
        const blacklist = ['eosio.null:*', 'eosio:onblock', 'eosio:onerror'];
        let whitelist = ['eosio:setcode', 'eosio:setabi'];

        for (const config of this.config.contracts) {
            whitelist = whitelist.concat(config.scope);
        }

        for (const scope of blacklist) {
            if (!StateReceiver.matchActionScope(scope, contract, action)) {
                continue;
            }

            return false;
        }

        for (const scope of whitelist) {
            if (!StateReceiver.matchActionScope(scope, contract, action)) {
                continue;
            }

            return true;
        }

        return false;
    }

    private isContractInScope(contract: string): boolean {
        for (const config of this.config.contracts) {
            for (const scope of config.scope) {
                if (!StateReceiver.matchActionScope(scope, contract)) {
                    continue;
                }

                return true;
            }
        }

        return false;
    }

    private getActionHandlers(contract: string, action?: string): IContractHandler[] {
        const handlers = [];

        for (let i = 0; i < this.config.contracts.length; i++) {
            for (const scope of this.config.contracts[i].scope) {
                if (!StateReceiver.matchActionScope(scope, contract, action)) {
                    continue;
                }

                handlers.push(this.handlers[i]);

                break;
            }
        }

        return handlers;
    }

    private static matchActionScope(scope: string, contract: string, action?: string): boolean {
        const split = scope.split(':');

        if (split[0] === '*') {
            return true;
        }

        if (split[0] === contract) {
            if (scope[1] === '*' || !action) {
                return true;
            }

            if (split[1] === action) {
                return true;
            }
        }

        return false;
    }
}
