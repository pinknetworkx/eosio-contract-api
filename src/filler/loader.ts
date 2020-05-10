import ConnectionManager from '../connections/manager';
import StateReceiver from './receiver';
import logger from '../utils/winston';
import getHandlers, { ContractHandler } from './handlers';
import { IReaderConfig } from '../types/config';
import { formatSecondsLeft } from '../utils/time';
import { PromiseEventHandler } from '../utils/event';

export default class ReaderLoader {
    private readonly handlers: ContractHandler[];
    private readonly reader: StateReceiver;
    private readonly events: PromiseEventHandler;

    constructor(private readonly config: IReaderConfig, private readonly connection: ConnectionManager) {
        this.events = new PromiseEventHandler();
        this.handlers = getHandlers(config.contracts, connection, this.events);
        this.reader = new StateReceiver(config, connection, this.events, this.handlers);
    }

    async deleteDB(): Promise<void> {
        for (const handler of this.handlers) {
            logger.info('Init handler ' + handler + ' for reader ' + this.config.name);

            await handler.deleteDB();
        }
    }

    async startFiller(logInterval: number): Promise<void> {
        if (this.config.delete_data) {
            await this.connection.database.query('DELETE FROM contract_readers WHERE name = $1', [this.config.name]);
            await this.connection.database.query('DELETE FROM reversible_queries WHERE reader = $1', [this.config.name]);

            for (const handler of this.handlers) {
                logger.info('Deleting data from handler ' + handler + ' for reader ' + this.config.name);

                await handler.init();
                await handler.deleteDB();
            }
        }

        const query = await this.connection.database.query('SELECT block_num FROM contract_readers WHERE name = $1', [this.config.name]);

        if (query.rowCount === 0) {
            logger.info('First run of reader. Initializing tables...');

            await this.connection.database.query(
                'INSERT INTO contract_readers(name, block_num, block_time, updated) VALUES ($1, $2, $3, $4)',
                [this.config.name, Math.max(this.config.start_block - 1, 0), 0, Date.now()]
            );
        } else if (this.config.start_block > 0) {
            if (this.config.start_block > query.rows[0].block_num) {
                await this.connection.database.query(
                    'UPDATE contract_readers SET block_num = $1 WHERE name = $2',
                    [this.config.start_block, this.config.name]
                );
            } else {
                throw new Error('Reader start block cannot be earlier than the last indexed block without deleting all data');
            }
        }

        logger.info('Starting reader: ' + this.config.name);

        for (const handler of this.handlers) {
            await handler.init();
        }

        await this.reader.startProcessing();

        let lastBlock = 0;
        setInterval(() => {
            if (lastBlock === 0) {
                lastBlock = this.reader.currentBlock;

                return;
            }

            const speed = (this.reader.currentBlock - lastBlock) / logInterval;

            if (lastBlock === this.reader.currentBlock && lastBlock > 0) {
                logger.warn('Reader ' + this.config.name + ' - No blocks processed');
            } else if (this.reader.currentBlock < this.reader.lastIrreversibleBlock) {
                logger.info(
                    'Reader ' + this.config.name + ' - ' +
                    'Progress: ' + this.reader.currentBlock + ' / ' + this.reader.headBlock + ' ' +
                    '(' + (100 * this.reader.currentBlock / this.reader.headBlock).toFixed(2) + '%) ' +
                    'Speed: ' + speed.toFixed(1) + ' B/s ' +
                    '(Syncs ' + formatSecondsLeft(Math.floor((this.reader.headBlock - this.reader.currentBlock) / speed)) + ')'
                );
            } else {
                logger.info(
                    'Reader ' + this.config.name + ' - ' +
                    'Current Block: ' + this.reader.currentBlock + ' ' +
                    'Speed: ' + speed.toFixed(1) + ' B/s '
                );
            }

            lastBlock = this.reader.currentBlock;
        }, logInterval * 1000);
    }
}
