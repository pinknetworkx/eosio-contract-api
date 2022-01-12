import { upgradeDb } from '../filler/upgrade-db';
import PostgresConnection from '../connections/postgres';
import logger from '../utils/winston';
import { IConnectionsConfig } from '../types/config';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const connectionConfig: IConnectionsConfig = require('../../config/connections.config.json');

async function main(): Promise<void> {
    const pg = connectionConfig.postgres;
    const db = `${pg.database}-test`;

    const tmpConnection = new PostgresConnection(pg.host, pg.port, pg.user, pg.password, pg.database);
    logger.info(`Dropping test db with name ${db}`);
    await tmpConnection.query(`DROP DATABASE IF EXISTS "${db}"`);
    logger.info(`Creating test db with name ${db}`);
    await tmpConnection.query(`CREATE DATABASE "${db}"`);

    const connection = new PostgresConnection(pg.host, pg.port, pg.user, pg.password, db);

    await upgradeDb(connection);

    process.exit(0);
}

main().catch(logger.error);