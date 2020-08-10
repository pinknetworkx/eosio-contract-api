import * as express from 'express';

import PostgresConnection from '../../../connections/postgres';
import { filterQueryArgs } from '../utils';
import logger from '../../../utils/winston';

export async function getLogs(
    db: PostgresConnection, contract: string, relationName: string, relationId: string,
    offset: number = 0, limit: number = 100, order: 'asc' | 'desc' = 'asc'
): Promise<Array<{log_id: number, name: string, data: any, txid: string, created_at_block: string, created_at_time: string}>> {
    const queryStr = 'SELECT log_id, name, data, encode(txid::bytea, \'hex\') txid, created_at_block, created_at_time ' +
        'FROM atomicassets_logs ' +
        'WHERE contract = $1 AND relation_name = $2 AND relation_id = $3 ' +
        'ORDER BY log_id ' + (order === 'asc' ? 'ASC' : 'DESC') + ' LIMIT $4 OFFSET $5';

    logger.debug(queryStr);

    const query = await db.query(queryStr, [contract, relationName, relationId, limit, offset]);

    return query.rows;
}

export function buildDataConditions(
    args: any, varCounter: number = 0, assetTable: string = '"asset"', templateTable: string = '"template"'
): {conditions: string[], values: any[]} {
    const keys = Object.keys(args);
    const dataConditions = [];
    const queryValues = [];

    for (const key of keys) {
        if (key.startsWith('data.')) {
            const keyVar = ++varCounter;
            const valVar = ++varCounter;

            const conditions = [];

            if (assetTable) {
                conditions.push(
                    `${assetTable}.immutable_data->>$${keyVar} = ${valVar}`,
                    `${assetTable}.mutable_data->>$${keyVar} = ${valVar}`
                );
            }

            if (templateTable) {
                conditions.push(
                    `${templateTable}.immutable_data->>$${keyVar} = ${valVar}`
                );
            }

            dataConditions.push(`(${conditions.join(' OR ')})`);
            queryValues.push(key.substr('data.'.length), args[key]);
        }
    }

    return {
        conditions: dataConditions,
        values: queryValues
    };
}

export function buildAssetFilter(
    req: express.Request, varOffset: number, assetTable: string = '"template"', templateTable: string = '"asset"'
): {str: string, values: any[]} {
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

    if (args.collection_name) {
        const data = buildDataConditions(req.query, varCounter, assetTable, templateTable);

        if (data.conditions.length > 0) {
            queryString += 'AND (' + data.conditions.join(' AND ') + ') ';

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
        queryString += 'AND (' +
                templateTable + '.readable_name ILIKE $' + ++varCounter + ' OR ' +
                assetTable + '.readable_name ILIKE $' + varCounter +
            ') ';
        queryValues.push('%' + args.match + '%');
    }

    return {
        values: queryValues,
        str: queryString
    };
}

export function buildGreylistFilter(
    req: express.Request, varOffset: number, collectionColumn: string = 'collection_name', accountColumns: string[] = []
): {str: string, values: any[]} {
    const args = filterQueryArgs(req, {
        collection_blacklist: {type: 'string', min: 1},
        collection_whitelist: {type: 'string', min: 1},
        account_blacklist: {type: 'string', min: 1}
    });

    let queryString = '';
    const queryValues: any[] = [];
    let varCounter = varOffset;

    if (args.collection_blacklist) {
        queryString += 'AND NOT (' + collectionColumn + ' = ANY ($' + ++varCounter + ')) ';
        queryValues.push(args.collection_blacklist.split(','));
    }

    if (args.collection_whitelist) {
        queryString += 'AND ' + collectionColumn + ' = ANY ($' + ++varCounter + ') ';
        queryValues.push(args.collection_whitelist.split(','));
    }

    if (args.account_blacklist) {
        const varCount = ++varCounter;
        queryValues.push(args.account_blacklist.split(','));

        for (const column of accountColumns) {
            queryString += 'AND NOT (' + column + ' = ANY ($' + varCount + ')) ';
        }
    }

    return {
        values: queryValues,
        str: queryString
    };
}
