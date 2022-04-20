import PostgresConnection from '../connections/postgres';

const settingOverrides: {[key: string]: {scale: string, threshold: number}} = {
    atomicassets_templates: {
        scale: '0.0',
        threshold: 100,
    },
};

export async function setAutoVacSettings(database: PostgresConnection): Promise<void> {
    await database.query('ANALYSE');

    const {rows} = await database.query('SELECT schemaname, relname AS tablename, n_live_tup::INT AS rows FROM pg_stat_user_tables');

    const sql = rows.map(table => {
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

        return `
            ALTER TABLE ${table.schemaname}.${table.tablename} SET (
                autovacuum_vacuum_scale_factor = ${scale},
                autovacuum_vacuum_threshold = ${threshold},
                autovacuum_analyze_scale_factor = ${scale},
                autovacuum_analyze_threshold = ${threshold * 10},
                autovacuum_vacuum_insert_scale_factor = ${scale},
                autovacuum_vacuum_insert_threshold = ${threshold * 10}
            );
        `;
    }).join('\n');

    await database.query(sql);
}
