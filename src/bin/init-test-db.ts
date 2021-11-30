import { ExecException, exec } from 'child_process';
import { upgradeDb } from '../filler/upgrade-db';
import PostgresConnection from '../connections/postgres';
import logger from '../utils/winston';
import { IConnectionsConfig } from '../types/config';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const connectionConfig: IConnectionsConfig = require('../../config/connections.config.json');

async function main(): Promise<void> {
    const pg = connectionConfig.postgres;
    const db = `${pg.database}-test`;
    await execCommand(`dropdb --username ${pg.user} --force --if-exists ${db}`);
    await execCommand(`createdb --username ${pg.user} ${db}`);

    const database = new PostgresConnection(pg.host, pg.port, pg.user, pg.password, db);

    await upgradeDb(database);

    process.exit(0);
}

main().catch(logger.error);

async function execCommand(cmd: string): Promise<void> {
    return await new Promise((resolve, reject) => {
        exec(cmd, (error: (ExecException | null), stdout: string, stderr: string) => {
            if (error) {
                reject(error);
            } else {
                stdout && logger.info(stdout);
                stderr && logger.error(stderr);
                resolve();
            }
        });
    });
}
