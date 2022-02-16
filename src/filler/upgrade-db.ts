import logger from '../utils/winston';
import * as fs from 'fs';
import { handlers } from './handlers/loader';
import { compareVersionString } from '../utils';
import PostgresConnection from '../connections/postgres';
import { IReaderConfig } from '../types/config';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const readerConfigs: IReaderConfig[] = require('../../config/readers.config.json');

export async function upgradeDb(database: PostgresConnection): Promise<void> {
    if (!(await database.tableExists('dbinfo'))) {
        logger.info('Could not find base tables. Create them now...');

        await database.query(fs.readFileSync('./definitions/tables/base_tables.sql', {
            encoding: 'utf8'
        }));

        logger.info('Base tables successfully created');
    }

    logger.info('Checking for available upgrades...');

    const client = await database.begin();
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
        logger.info('Found ' + upgradeVersions.length + ' available upgrades. Starting to upgradeDB...');

        for (const version of upgradeVersions) {
            const versionDir = `./definitions/migrations/${version}/`;

            logger.info('Upgrade to ' + version + ' ...');

            await client.query('BEGIN');

            await client.query(fs.readFileSync(`${versionDir}database.sql`, {
                encoding: 'utf8'
            }));

            for (const handlerName of availableContracts) {
                const handler = availableHandlers.find(row => row.handlerName === handlerName);

                const handlerFilename = `${versionDir}${handlerName}.sql`;
                if (fs.existsSync(handlerFilename)) {
                    await client.query(fs.readFileSync(handlerFilename, {encoding: 'utf8'}));
                }

                await handler.upgrade(client, version);

                logger.info('Upgraded ' + handlerName + ' to ' + version);
            }

            logger.info('Successfully upgraded to ' + version);

            await client.query('COMMIT');
        }
    }

    client.release();
}
