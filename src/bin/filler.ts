import * as cluster from 'cluster';
import * as fs from 'fs';
import * as express from 'express';

import Filler from '../filler/filler';
import ConnectionManager from '../connections/manager';
import logger from '../utils/winston';
import { IConnectionsConfig, IReaderConfig } from '../types/config';
import { compareVersionString } from '../utils';
import { handlers } from '../filler/handlers/loader';

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

        logger.info('Checking for available upgrades...');

        const client = await connection.database.begin();
        const versionQuery = await client.query('SELECT "value" FROM dbinfo WHERE name = \'version\'');
        const currentVersion = versionQuery.rows.length > 0 ? versionQuery.rows[0].value : '1.0.0';

        const availableHandlers = handlers;
        const availableContracts: string[] = readerConfigs
            .reduce((prev, curr) => [...prev, ...curr.contracts.map(row => row.handler)], [])
            .filter((row, pos, arr) => arr.indexOf(row) === pos);
        const availableVersions: string[] = fs.readdirSync('./definitions/migrations')
            .sort((a, b) => compareVersionString(a, b));

        // init contracts
        for (const handlerName of availableContracts) {
            const handler = availableHandlers.find(row => row.handlerName === handlerName);

            if (!handler) {
                logger.error('Contract handler configured which does not exist: ' + handlerName);

                process.exit(1);
            }

            if (await handler.setup(client)) {
                logger.info('Tables for handler ' + handlerName + ' created.');

                const pastVersions = availableVersions.filter(version => compareVersionString(version, currentVersion) <= 0);

                for (const version of pastVersions) {
                    const filename = './definitions/migrations/' + version + '/' + handlerName + '.sql';

                    if (fs.existsSync(filename)) {
                        await client.query(fs.readFileSync(filename, {encoding: 'utf8'}));
                    }

                    await handler.upgrade(client, version);
                }
            }
        }

        await client.query('COMMIT');

        const upgradeVersions = availableVersions.filter(version => compareVersionString(version, currentVersion) > 0);

        if (upgradeVersions.length > 0) {
            logger.info('Found ' + upgradeVersions.length + ' available upgrades. Starting to upgrade...');

            for (const version of upgradeVersions) {
                logger.info('Upgrade to ' + version + ' ...');

                await client.query('BEGIN');

                await client.query(fs.readFileSync('./definitions/migrations/' + version + '/database.sql', {
                    encoding: 'utf8'
                }));

                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const migrateFn = require('../../definitions/migrations/' + version + '/script');

                migrateFn(client);

                for (const handlerName of availableContracts) {
                    const handler = availableHandlers.find(row => row.handlerName === handlerName);

                    const filename = './definitions/migrations/' + version + '/' + handlerName + '.sql';

                    if (fs.existsSync(filename)) {
                        await client.query(fs.readFileSync(filename, {encoding: 'utf8'}));
                    }

                    await handler.upgrade(client, version);

                    logger.info('Upgraded ' + handlerName + ' to ' + version);
                }

                logger.info('Successfully upgraded to ' + version);

                await client.query('COMMIT');
            }
        }

        client.release();

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
