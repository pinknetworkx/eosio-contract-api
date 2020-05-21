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

export function buildDataConditions(args: any, varCounter: number = 0): {conditions: string[], values: any[]} {
    const keys = Object.keys(args);
    const dataConditions = [];
    const queryValues = [];

    for (const key of keys) {
        if (key.startsWith('data.')) {
            const conditionKeys = key.substring(5).split('.');

            let condition = '(data."key" = $' + ++varCounter + ' AND ';
            queryValues.push(conditionKeys[0]);

            let column;
            if (conditionKeys.length > 1 && !isNaN(parseInt(conditionKeys[1], 10))) {
                column = 'data."value"->>' + parseInt(conditionKeys[1], 10);
            } else {
                column = 'data."value"::text';
            }

            const possibleValues = [column + ' = $' + ++varCounter];
            queryValues.push(JSON.stringify(args[key]));

            if (!isNaN(parseFloat(String(args[key])))) {
                possibleValues.push(column + ' = $' + ++varCounter);
                queryValues.push(String(parseFloat(String(args[key]))));
            }

            condition += '(' + possibleValues.join(' OR ') + '))';

            dataConditions.push(condition);
        }
    }

    return {
        conditions: dataConditions,
        values: queryValues
    };
}
