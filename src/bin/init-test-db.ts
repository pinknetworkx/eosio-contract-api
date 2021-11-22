import { ExecException, exec } from 'child_process';
import { upgradeDb } from '../filler/upgrade-db';
import PostgresConnection from '../connections/postgres';

async function main(): Promise<void> {
    const db = 'atomichub-test';
    await execCommand(`dropdb --username postgres --force --if-exists ${db}`);
    await execCommand(`createdb --username postgres ${db}`);

    const database = new PostgresConnection('localhost', 5432, 'postgres', 'x', db);

    await upgradeDb(database);

    process.exit(0);
}

main().then(console.info, console.error);

async function execCommand(cmd: string): Promise<void> {
    return await new Promise((resolve, reject) => {
        exec(cmd, (error: (ExecException | null), stdout: string, stderr: string) => {
            if (error) {
                reject(error);
            } else {
                stdout && console.info(stdout);
                stderr && console.error(stderr);
                resolve();
            }
        });
    });
}
