import ConnectionManager from '../connections/manager';
import StateReceiver from './receiver';
import logger from '../utils/winston';
import { IReaderConfig } from '../types/config';
import { formatSecondsLeft } from '../utils/time';
import { getHandlers } from './handlers';
import { ContractHandler } from './handlers/interfaces';
import { ModuleLoader } from './modules';

function estimateSeconds(blocks: number, speed: number, depth: number = 0): number {
    if (blocks <= 2) {
        return 1;
    }

    if (speed < 2) {
        return -1;
    }

    if (depth > 20) {
        return 0;
    }

    const seconds = Math.floor(blocks / speed);

    return seconds + estimateSeconds(seconds * 2, speed, depth + 1);
}

export default class Filler {
    readonly reader: StateReceiver;
    readonly modules: ModuleLoader;

    private readonly standardMaterializedViews: Array<{name: string, interval: number, refreshed: number}>;
    private readonly priorityMaterializedViews: Array<{name: string, interval: number, refreshed: number}>;
    private running: boolean;

    private readonly handlers: ContractHandler[];

    constructor(private readonly config: IReaderConfig, readonly connection: ConnectionManager) {
        this.handlers = getHandlers(config.contracts, this);
        this.modules = new ModuleLoader(config.modules || []);
        this.reader = new StateReceiver(config, connection, this.handlers, this.modules);

        this.standardMaterializedViews = [];
        this.priorityMaterializedViews = [];
        this.running = false;

        logger.info(this.handlers.length + ' contract handlers registered');
        for (const handler of this.handlers) {
            logger.info('Contract handler ' + handler.getName() + ' registered', handler.args);
        }
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
        transaction.release();
    }

    async startFiller(logInterval: number): Promise<void> {
        const initTransaction = await this.connection.database.begin();

        for (let i = 0; i < this.handlers.length; i++) {
            logger.info('Init handler ' + this.config.contracts[i].handler + ' for reader ' + this.config.name);

            await this.handlers[i].init(initTransaction);
        }

        await initTransaction.query('COMMIT');
        initTransaction.release();

        if (this.config.delete_data) {
            logger.info('Deleting data from handler of reader ' + this.config.name);

            await this.deleteDB();
        }

        const query = await this.connection.database.query('SELECT block_num FROM contract_readers WHERE name = $1', [this.config.name]);

        if (query.rowCount === 0) {
            logger.info('First run of reader. Initializing tables...');

            await this.connection.database.query(
                'INSERT INTO contract_readers(name, block_num, block_time, live, updated) VALUES ($1, $2, $3, $4, $5)',
                [this.config.name, 0, 0, false, Date.now()]
            );
        }

        logger.info('Starting reader: ' + this.config.name);

        await this.reader.startProcessing();

        const lastBlockSpeeds: number[] = [];
        let blockRange = 0;
        let lastBlockNum = 0;
        let lastBlockTime = Date.now();
        let timeout = 3600 * 1000;

        const interval = setInterval(async () => {
            if (!this.running) {
                clearInterval(interval);
            }

            if (lastBlockNum === 0) {
                if (this.reader.currentBlock) {
                    blockRange = this.reader.blocksUntilHead;
                    lastBlockNum = this.reader.currentBlock;
                } else {
                    logger.warn('Not receiving any blocks');
                }

                return;
            }

            const speed = (this.reader.currentBlock - lastBlockNum) / logInterval;
            lastBlockSpeeds.push(speed);

            if (lastBlockSpeeds.length > 60) {
                lastBlockSpeeds.shift();
            }

            if (lastBlockNum === this.reader.currentBlock && lastBlockNum > 0) {
                const staleTime = Date.now() - lastBlockTime;

                if (staleTime > timeout) {
                    process.send({msg: 'failure'});

                    await new Promise(resolve => setTimeout(resolve, logInterval / 2 * 1000));

                    process.exit(1);
                }

                logger.warn('Reader ' + this.config.name + ' - No blocks processed - Stopping in ' + Math.round((timeout - staleTime) / 1000) + ' seconds');
            } else if (this.reader.blocksUntilHead > 120) {
                lastBlockTime = Date.now();
                timeout = 3 * 60 * 1000;

                if (blockRange === 0) {
                    blockRange = this.reader.blocksUntilHead;
                }

                const averageSpeed = lastBlockSpeeds.reduce((prev, curr) => prev + curr, 0) / lastBlockSpeeds.length;
                const currentBlock = Math.max(blockRange - this.reader.blocksUntilHead, 0);

                logger.info(
                    'Reader ' + this.config.name + ' - ' +
                    'Progress: ' + this.reader.currentBlock + ' / ' + (this.reader.currentBlock + this.reader.blocksUntilHead) + ' ' +
                    '(' + (100 * currentBlock / blockRange).toFixed(2) + '%) ' +
                    'Speed: ' + speed.toFixed(1) + ' B/s [DS:' + this.reader.dsQueue.size + '|SH:' + this.reader.ship.blocksQueue.size + ']' +
                    '(Syncs ' + formatSecondsLeft(estimateSeconds(this.reader.blocksUntilHead, averageSpeed)) + ')'
                );
            } else {
                lastBlockTime = Date.now();
                blockRange = 0;
                timeout = 3 * 60 * 1000;

                logger.info(
                    'Reader ' + this.config.name + ' - ' +
                    'Current Block: ' + this.reader.currentBlock + ' ' +
                    'Speed: ' + speed.toFixed(1) + ' B/s '
                );
            }

            lastBlockNum = this.reader.currentBlock;
        }, logInterval * 1000);

        this.running = true;

        setTimeout(async () => {
            while (this.running) {
                for (const view of this.standardMaterializedViews) {
                    if (view.refreshed + view.interval < Date.now()) {
                        try {
                            await this.connection.database.query('REFRESH MATERIALIZED VIEW CONCURRENTLY ' + view.name);
                        } catch (err){
                            logger.error('Error while refreshing materalized view ' + view.name, err);
                        } finally {
                            view.refreshed = Date.now();
                        }
                    }
                }

                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }, 5000);

        setTimeout(async () => {
            while (this.running) {
                for (const view of this.priorityMaterializedViews) {
                    if (view.refreshed + view.interval < Date.now()) {
                        try {
                            await this.connection.database.query('REFRESH MATERIALIZED VIEW CONCURRENTLY ' + view.name);
                        } catch (err){
                            logger.error('Error while refreshing materalized view ' + view.name, err);
                        } finally {
                            view.refreshed = Date.now();
                        }
                    }
                }

                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }, 5000);
    }

    async stopFiller(): Promise<void> {
        this.running = false;

        await this.reader.stopProcessing();
    }

    registerMaterializedViewRefresh(name: string, interval: number, priority = false): void {
        if (priority) {
            this.priorityMaterializedViews.push({name, interval, refreshed: Date.now()});
        } else {
            this.standardMaterializedViews.push({name, interval, refreshed: Date.now()});
        }
    }
}
