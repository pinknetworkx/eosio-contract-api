import ConnectionManager from '../connections/manager';
import StateReceiver from './receiver';
import logger from '../utils/winston';
import { getHandlers } from './handlers';
import { ContractHandler } from './handlers/interfaces';
import { IReaderConfig } from '../types/config';
import { formatSecondsLeft } from '../utils/time';
import { PromiseEventHandler } from '../utils/event';

export default class Reader {
    private readonly handlers: ContractHandler[];
    private readonly reader: StateReceiver;
    private readonly events: PromiseEventHandler;

    constructor(private readonly config: IReaderConfig, private readonly connection: ConnectionManager) {
        this.events = new PromiseEventHandler();
        this.handlers = getHandlers(config.contracts, connection, this.events);
        this.reader = new StateReceiver(config, connection, this.events, this.handlers);
    }

    async deleteDB(): Promise<void> {
        const transaction = await this.connection.database.begin();

        await transaction.query('DELETE FROM contract_readers WHERE name = $1', [this.config.name]);
        await transaction.query('DELETE FROM reversible_queries WHERE reader = $1', [this.config.name]);

        try {
            for (const handler of this.handlers) {
                await handler.deleteDB(transaction);
            }
        } catch (e) {
            logger.error(e);
            await transaction.query('ROLLBACK');

            return;
        }

        await transaction.query('COMMIT');
    }

    async startFiller(logInterval: number): Promise<void> {
        for (let i = 0; i < this.handlers.length; i++) {
            logger.info('Init handler ' + this.config.contracts[i].handler + ' for reader ' + this.config.name);

            await this.handlers[i].init();
        }

        if (this.config.delete_data) {
            logger.info('Deleting data from handler of reader ' + this.config.name);

            await this.deleteDB();
        }

        const query = await this.connection.database.query('SELECT block_num FROM contract_readers WHERE name = $1', [this.config.name]);

        if (query.rowCount === 0) {
            logger.info('First run of reader. Initializing tables...');

            await this.connection.database.query(
                'INSERT INTO contract_readers(name, block_num, block_time, updated) VALUES ($1, $2, $3, $4)',
                [this.config.name, 0, 0, Date.now()]
            );
        }

        logger.info('Starting reader: ' + this.config.name);

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
