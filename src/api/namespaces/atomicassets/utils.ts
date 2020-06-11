import * as express from 'express';

import PostgresConnection from '../../../connections/postgres';
import { filterQueryArgs } from '../utils';

export async function getLogs(
    db: PostgresConnection, contract: string, relationName: string, relationId: string,
    offset: number = 0, limit: number = 100, order: 'asc' | 'desc' = 'asc'
): Promise<Array<{log_id: number, name: string, data: any, txid: string, created_at_block: string, created_at_time: string}>> {
    const queryStr = 'SELECT log_id, name, data, encode(txid::bytea, \'hex\') txid, created_at_block, created_at_time ' +
        'FROM atomicassets_logs ' +
        'WHERE contract = $1 AND relation_name = $2 AND relation_id = $3 ' +
        'ORDER BY created_at_block, log_id ' + (order === 'asc' ? 'ASC' : 'DESC') + ' LIMIT $4 OFFSET $5';

    const query = await db.query(queryStr, [contract, relationName, relationId, limit, offset]);

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

export function buildAssetFilter(req: express.Request, varOffset: number): {str: string, values: any[]} {
    const args = filterQueryArgs(req, {
        owner: {type: 'string', min: 1, max: 12},
        template_id: {type: 'int', min: 0},
        collection_name: {type: 'string', min: 1, max: 12},
        schema_name: {type: 'string', min: 1, max: 12},
        match: {type: 'string', min: 1}
    });

    let queryString = '';
    let queryValues: any[] = [];
    let varCounter = varOffset;

    if (args.collection_name && args.schema_name) {
        const data = buildDataConditions(req.query, varCounter);

        if (data.conditions.length > 0) {
            queryString += 'AND (' +
                'EXISTS (' +
                'SELECT "key" ' +
                'FROM atomicassets_assets_data data ' +
                'WHERE data.contract = asset.contract AND data.asset_id = asset.asset_id AND ' +
                '(' + data.conditions.join(' OR ') + ')' +
                ') ';

            queryString += 'OR ' +
                'EXISTS (' +
                'SELECT "key" ' +
                'FROM atomicassets_templates_data data ' +
                'WHERE data.contract = asset.contract AND data.template_id = asset.template_id AND ' +
                '(' + data.conditions.join(' OR ') + ')' +
                ')) ';

            queryValues = queryValues.concat(data.values);
            varCounter += data.values.length;
        }
    }

    if (args.owner) {
        queryString += 'AND asset.owner = $' + ++varCounter + ' ';
        queryValues.push(args.owner);
    }

    if (args.template_id) {
        queryString += 'AND asset.template_id = $' + ++varCounter + ' ';
        queryValues.push(args.template_id);
    }

    if (args.collection_name) {
        queryString += 'AND asset.collection_name = $' + ++varCounter + ' ';
        queryValues.push(args.collection_name);
    }

    if (args.schema_name) {
        queryString += 'AND asset.schema_name = $' + ++varCounter + ' ';
        queryValues.push(args.schema_name);
    }

    if (args.match) {
        queryString += 'AND asset.name LIKE $' + ++varCounter + ' ';
        queryValues.push('%' + args.match + '%');
    }

    return {
        values: queryValues,
        str: queryString
    };
}
