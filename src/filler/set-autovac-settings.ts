import ConnectionManager from '../connections/manager';
import logger from '../utils/winston';

const settingOverrides: {[key: string]: {scale: string, threshold: number}} = {
    atomicassets_templates: {
        scale: '0.0',
        threshold: 100,
    },
};

export async function setAutoVacSettings(connection: ConnectionManager): Promise<void> {
    const dbinfo = await connection.database.query(`SELECT * FROM dbinfo WHERE name = 'vacuum_settings'`);

    if (dbinfo.rows.length > 0 && +dbinfo.rows[0].value + 3600 * 24 * 7 * 1000 > Date.now()) {
        logger.info('Skipping updating vacuum settings');

        return;
    }

    const {rows} = await connection.database.query(
        `SELECT schemaname, relname AS tablename, n_live_tup::INT AS rows FROM pg_stat_user_tables 
        WHERE schemaname = 'public'`
    );

    for (const table of rows) {
        let scale = '0.05';
        let threshold = 50;

        if (table.rows > 1_000_00) {
            scale = '0.0';
            threshold = 10_000;
        }

        if (table.rows > 5_000_000) {
            threshold = 100_000;
        }

        if (settingOverrides[table.tablename]?.scale !== undefined) {
            scale = settingOverrides[table.tablename].scale;
        }
        if (settingOverrides[table.tablename]?.threshold !== undefined) {
            threshold = settingOverrides[table.tablename].threshold;
        }

        try {
            await connection.database.query(`
                ALTER TABLE ${table.schemaname}.${table.tablename} SET (
                    autovacuum_vacuum_scale_factor = ${scale},
                    autovacuum_vacuum_threshold = ${threshold},
                    autovacuum_analyze_scale_factor = ${scale},
                    autovacuum_analyze_threshold = ${threshold * 10},
                    autovacuum_vacuum_insert_scale_factor = ${scale},
                    autovacuum_vacuum_insert_threshold = ${threshold * 10}
                )
            `);

            logger.info(`Updated autovaccum settings for ${table.schemaname}.${table.tablename}`)
        } catch (error) {
            logger.error(`Failed to change autovaccum settings for ${table.schemaname}.${table.tablename}`, error);
        }
    }

    if (dbinfo.rows.length === 0) {
        await connection.database.query(`INSERT INTO dbinfo ("name", "value", updated) VALUES ('vacuum_settings', '${Date.now()}', extract(epoch from current_timestamp)::bigint);`);
    } else {
        await connection.database.query(`UPDATE dbinfo SET "value" = '${Date.now()}' WHERE name = 'vacuum_settings';`);
    }

    logger.info('Updated vacuum settings for tables.')
}
