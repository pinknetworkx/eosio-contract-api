import PostgresConnection from '../../../connections/postgres';
import { serializeEosioName } from '../../../utils/eosio';

export async function getLogs(
    db: PostgresConnection, contract: string, relation_name: string, relation_id: string, offset: number = 0, limit: number = 100
): Promise<Array<{log_id: number, name: string, data: any, txid: string, created_at_block: string, created_at_time: string}>> {
    const queryStr = 'SELECT log_id, name, data, encode(txid::bytea, \'hex\') txid, created_at_block, created_at_time ' +
        'FROM atomicassets_logs ' +
        'WHERE contract = $1 AND relation_name = $2 AND relation_id = $3 ' +
        'ORDER BY created_at_block, log_id ASC LIMIT $4 OFFSET $5';

    const query = await db.query(queryStr, [serializeEosioName(contract), relation_name, relation_id, limit, offset]);

    return query.rows;
}
