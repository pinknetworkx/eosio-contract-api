import { PoolClient } from 'pg';

import ConnectionManager from '../connections/manager';

export class ContractDB {
    constructor(readonly name: string, readonly connection: ConnectionManager) { }

    async startTransaction(currentBlock: number, lastIrreversibleBlock: number): Promise<ContractDBTransaction> {
        const client = await this.connection.database.begin();

        return new ContractDBTransaction(client, this.name, currentBlock, lastIrreversibleBlock);
    }

    async fetchAbi(contract: string, blockNum: number): Promise<{data: Uint8Array, block_num: number} | null> {
        // TODO fetch real ABI

        return null;
    }

    async getReaderPosition(): Promise<number> {
        // TODO: fetch real position

        return 26185335;
    }
}

export class ContractDBTransaction {
    constructor(
        readonly client: PoolClient, readonly name: string, readonly currentBlock: number, readonly lastIrreversibleBlock: number
    ) { }

    async insert() {

    }

    async update() {

    }

    async delete() {

    }

    async clearForkDatabase(blockNum: number) {

    }

    async applyForkDatabase(blockNum: number) {

    }

    async updateReaderPosition(blockNum: number) {

    }

    async commit(): Promise<void> {
        try {
            await this.client.query('COMMIT');
        } finally {
            this.client.release();
        }
    }

    async abort(): Promise<void> {
        try {
            await this.client.query('ROLLBACK');
        } finally {
            this.client.release();
        }
    }
}
