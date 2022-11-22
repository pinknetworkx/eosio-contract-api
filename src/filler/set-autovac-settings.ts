import ConnectionManager from '../connections/manager';
import logger from '../utils/winston';

const settingOverrides: {[key: string]: {scale: string, threshold: number}} = {
    atomicassets_templates: {
        scale: '0.0',
        threshold: 100,
    },
};

export async function setAutoVacSettings(connection: ConnectionManager): Promise<void> {
    const dbinfo = await connection.database.query('SELECT * FROM dbinfo WHERE name = \'vacuum_settings\'');

    if (dbinfo.rows.length > 0 && +dbinfo.rows[0].value + 3600 * 24 * 7 * 1000 > Date.now()) {
        logger.info('Skipping updating vacuum settings');

        return;
    }

    const {rows: tables} = await connection.database.query(`
        SELECT schemaname, relname AS tablename, n_live_tup::INT AS rows,
            (SELECT STRING_AGG(quote_ident(attname), ',') FROM pg_attribute WHERE attrelid = relid AND attnum > 0 AND NOT attisdropped) AS columns
        FROM pg_stat_user_tables 
        WHERE schemaname = 'public'
            AND relid NOT IN (SELECT inhparent FROM pg_inherits)
    `);

    let hasError = false;

    for (const table of tables) {
        let scale = '0.05';
        let threshold = 50;
        let statistics = 100; // 300 * statistics rows are analysed

        if (table.rows > 1_000_00) {
            scale = '0.0';
            threshold = 10_000;
            statistics = 200;
        }

        if (table.rows > 5_000_000) {
            threshold = 100_000;
            statistics = 400;
        }

        if (settingOverrides[table.tablename]?.scale !== undefined) {
            scale = settingOverrides[table.tablename].scale;
        }
        if (settingOverrides[table.tablename]?.threshold !== undefined) {
            threshold = settingOverrides[table.tablename].threshold;
        }

        const updateSQL = `
            ALTER TABLE ${table.schemaname}.${table.tablename} SET (
                autovacuum_vacuum_scale_factor = ${scale},
                autovacuum_vacuum_threshold = ${threshold},
                autovacuum_analyze_scale_factor = ${scale},
                autovacuum_analyze_threshold = ${threshold * 10},
                autovacuum_vacuum_insert_scale_factor = ${scale},
                autovacuum_vacuum_insert_threshold = ${threshold * 10}
            ), ${table.columns.split(',').map((col: string) => `ALTER COLUMN ${col} SET STATISTICS ${statistics}`).join(',\n')} 
        `;
        try {
            await connection.database.query(updateSQL);

            logger.info(`Updated autovaccum settings for ${table.schemaname}.${table.tablename}`);
        } catch (error) {
            hasError = true;
            logger.error(`Failed to change autovaccum settings for ${table.schemaname}.${table.tablename}.\nSQL: ${updateSQL}`, error);
        }
    }

    if (!hasError) {
        await connection.database.query(`
            INSERT INTO dbinfo ("name", "value", updated)
                VALUES ('vacuum_settings', '${Date.now()}', extract(epoch from current_timestamp)::bigint)
            ON CONFLICT (name)
                DO UPDATE SET "value" = EXCLUDED.value
        `);
    }
}
