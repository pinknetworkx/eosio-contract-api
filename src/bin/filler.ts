import * as cluster from 'cluster';
import * as fs from 'fs';

import Reader from '../filler/reader';
import ConnectionManager from '../connections/manager';
import logger from '../utils/winston';
import { IConnectionsConfig, IReaderConfig } from '../types/config';

const readerConfigs: IReaderConfig[] = require('../../config/readers.config.json');
const connectionConfig: IConnectionsConfig = require('../../config/connections.config.json');

if (cluster.isMaster) {
    logger.info('Starting workers...');

    // init global tables if missing
    const connection = new ConnectionManager(connectionConfig);

    (async () => {
        if (!(await connection.chain.checkChainId())) {
            logger.error('Chain Id in config mismatches node chain id');

            process.exit(1);
        }

        if (!(await connection.database.tableExists('contract_readers'))) {
            logger.info('Could not find base tables. Create them now...');

            await connection.database.query(fs.readFileSync('./definitions/tables/base_tables.sql', {
                encoding: 'utf8'
            }));

            logger.info('Base tables successfully created');
        }

        for (let i = 0; i < readerConfigs.length; i++) {
            cluster.fork({
                config_index: i
            });
        }
    })();
} else {
    logger.info('Worker ' + process.pid + ' started');

    const connection = new ConnectionManager(connectionConfig);
    const reader = new Reader(readerConfigs[parseInt(process.env.config_index, 10)], connection);

    reader.startFiller(2).then();
}
