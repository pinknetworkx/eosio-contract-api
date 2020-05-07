import ConnectionManager from '../connections/manager';
import StateReceiver from './receiver';
import logger from '../utils/winston';
import getHandlers, { IContractHandler } from './handlers';
import { IReaderConfig } from '../types/config';

export default class ReaderLoader {
    private readonly handlers: IContractHandler[];
    private readonly reader: StateReceiver;

    constructor(private readonly config: IReaderConfig, private readonly connection: ConnectionManager) {
        this.handlers = getHandlers(config.contracts, connection);
        this.reader = new StateReceiver(config, connection, this.handlers);
    }

    async initDB(): Promise<void> {
        for (const handler of this.handlers) {
            logger.info('Init handler ' + handler.name + ' for reader ' + this.config.name);

            await handler.initDB();
        }
    }

    async deleteDB(): Promise<void> {
        for (const handler of this.handlers) {
            logger.info('Init handler ' + handler.name + ' for reader ' + this.config.name);

            await handler.deleteDB();
        }
    }

    async startFiller(): Promise<void> {
        if (this.config.delete_tables) {
            await this.connection.database.query('DELETE FROM contract_readers WHERE name = $1', [this.config.name]);

            await this.deleteDB();
        }

        const query = await this.connection.database.query('SELECT * FROM contract_readers WHERE name = $1', [this.config.name]);

        if (query.rowCount === 0) {
            logger.info('First run of reader. Initializing tables...');

            await this.connection.database.query(
                'INSERT INTO contract_readers(name, block_num, block_time, updated) VALUES ($1, $2, $3, $4)',
                [this.config.name, Math.max(this.config.start_block, 1), 0, Date.now()]
            );

            await this.initDB();
        }

        logger.info('starting reader ' + this.config.name);

        for (const handler of this.handlers) {
            await handler.init();
        }

        await this.reader.startProcessing();
    }
}
