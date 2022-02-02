import * as cluster from 'cluster';
import * as express from 'express';

import Filler from '../filler/filler';
import ConnectionManager from '../connections/manager';
import logger from '../utils/winston';
import { IConnectionsConfig, IReaderConfig } from '../types/config';
import { upgradeDb } from '../filler/upgrade-db';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const readerConfigs: IReaderConfig[] = require('../../config/readers.config.json');

let connectionConfig: IConnectionsConfig = {postgres: {}, redis: {}, chain: {}} as IConnectionsConfig;

try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    connectionConfig = require('../../config/connections.config.json');
} catch {
    logger.warn('No connections.config.json found. Falling back to environment variables');
}

if (!readerConfigs || readerConfigs.length === 0) {
    logger.error('No readers defined');

    process.exit(-1);
}

// @ts-ignore
if (cluster.isPrimary || cluster.isMaster) {
    logger.info('Starting workers...');

    // init global tables if missing
    const connection = new ConnectionManager(connectionConfig);

    (async (): Promise<void> => {
        await connection.connect();

        if (!(await connection.chain.checkChainId())) {
            logger.error('Chain Id in config mismatches node chain id');

            process.exit(1);
        }

        await upgradeDb(connection.database);

        for (let i = 0; i < readerConfigs.length; i++) {
            // @ts-ignore
            const worker = cluster.fork({config_index: i});

            worker.on('message', (data: any) => {
                if (data.msg === 'failure') {
                    process.exit(-1);
                }
            });
        }
    })();

    const app = express();

    app.get('/healthc', async (req, res) => {
        if (await connection.alive()) {
            res.status(200).send('success');
        } else {
            res.status(500).send('error');
        }
    });

    app.listen(readerConfigs[0].server_port || 9001, readerConfigs[0].server_addr || '0.0.0.0');
} else {
    logger.info('Worker ' + process.pid + ' started');

    const index = parseInt(process.env.config_index, 10);

    // delay startup for each reader to avoid startup transaction conflicts
    setTimeout(async () => {
        const connection = new ConnectionManager(connectionConfig);
        const reader = new Filler(readerConfigs[index], connection);

        await reader.startFiller(5);
    }, index * 1000);
}
