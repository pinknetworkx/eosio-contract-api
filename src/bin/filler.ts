import * as cluster from 'cluster';
import * as fs from 'fs';

import Filler from '../filler/filler';
import ConnectionManager from '../connections/manager';
import logger from '../utils/winston';
import { IConnectionsConfig, IReaderConfig } from '../types/config';
import { compareVersionString } from '../utils';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const readerConfigs: IReaderConfig[] = require('../../config/readers.config.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const connectionConfig: IConnectionsConfig = require('../../config/connections.config.json');

if (cluster.isMaster) {
    logger.info('Starting workers...');

    // init global tables if missing
    const connection = new ConnectionManager(connectionConfig);

    (async (): Promise<void> => {
        if (!(await connection.chain.checkChainId())) {
            logger.error('Chain Id in config mismatches node chain id');

            process.exit(1);
        }

        if (!(await connection.database.tableExists('dbinfo'))) {
            logger.info('Could not find base tables. Create them now...');

            await connection.database.query(fs.readFileSync('./definitions/tables/base_tables.sql', {
                encoding: 'utf8'
            }));

            logger.info('Base tables successfully created');
        }

        logger.info('Checking for available updates...');

        const versionQuery = await connection.database.query('SELECT "value" FROM dbinfo WHERE name = \'version\'');
        const currentVersion = versionQuery.rows.length > 0 ? versionQuery.rows[0].value : '1.0.0';

        const availableVersions = fs.readdirSync('./definitions/migrations')
            .sort((a, b) => compareVersionString(a, b))
            .filter(version => compareVersionString(version, currentVersion) > 0);

        if (availableVersions.length > 0) {
            logger.info('Found ' + availableVersions.length + ' available updates. Starting to update...');

            for (const version of availableVersions) {
                logger.info('Update to ' + version + ' ...');

                const client = await connection.database.begin();

                await client.query(fs.readFileSync('./definitions/migrations/' + version + '/database.sql', {
                    encoding: 'utf8'
                }));

                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const migrateFn = require('../../definitions/migrations/' + version + '/script');

                migrateFn(client);

                await client.query('COMMIT');

                client.release();

                logger.info('Successfully updated to ' + version);
            }
        }

        for (let i = 0; i < readerConfigs.length; i++) {
            const worker = cluster.fork({config_index: i});

            worker.on('message', data => {
                if (data.msg === 'failure') {
                    process.exit(-1);
                }
            });
        }
    })();
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
