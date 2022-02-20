import {Namespace} from 'socket.io';
import * as express from 'express';

import {DB, HTTPServer} from './server';
import {NotificationData} from '../filler/notifier';
import {ApiError} from './error';
import logger from '../utils/winston';

export async function getContractActionLogs(
    db: DB, contract: string, actions: string[], condition: { [key: string]: any },
    offset: number = 0, limit: number = 100, order: 'asc' | 'desc' = 'asc'
): Promise<Array<{ log_id: number, name: string, data: any, txid: string, created_at_block: string, created_at_time: string }>> {
    const queryStr = 'SELECT global_sequence log_id, name, metadata "data", encode(txid::bytea, \'hex\') txid, created_at_block, created_at_time ' +
        'FROM contract_traces ' +
        'WHERE account = $1 AND name = ANY($2) AND metadata @> $3::jsonb ' +
        'ORDER BY global_sequence ' + (order === 'asc' ? 'ASC' : 'DESC') + ' LIMIT $4 OFFSET $5 ';

    const query = await db.query(queryStr, [contract, actions, JSON.stringify(condition), limit, offset]);
    const emptyCondition = Object.keys(condition).reduce((prev, curr) => ({...prev, [curr]: undefined}), {});

    return query.rows.map(row => ({
        ...row, data: JSON.parse(JSON.stringify({...row.data, ...emptyCondition}))
    }));
}

export function applyActionGreylistFilters(
    actions: string[],
    args: { action_whitelist?: string, action_blacklist?: string },
): string[] {
    let result = [...actions];

    if (args.action_whitelist) {
        result = args.action_whitelist.split(',');
    }

    if (args.action_blacklist) {
        for (const action of args.action_blacklist.split(',')) {
            const index = result.indexOf(action);

            if (index > -1) {
                result.splice(index, 1);
            }
        }
    }

    return result;
}

export function createSocketApiNamespace(server: HTTPServer, path: string): Namespace {
    return server.socket.io.of(path);
}

export function extractNotificationIdentifiers(notifications: NotificationData[], key: string): string[] {
    const result = [];

    for (const notification of notifications) {
        let identifier: any = null;

        if (notification.type === 'delta') {
            // @ts-ignore
            identifier = notification.data.delta.value[key];
        }

        if (notification.type === 'trace' && notification.data.trace) {
            // @ts-ignore
            identifier = notification.data.trace.act.data[key];
        }

        if (identifier && result.indexOf(identifier) === -1) {
            result.push(identifier);
        }
    }

    return result;
}

export function respondApiError(res: express.Response, error: Error): express.Response {
    if ((error as ApiError).showMessage) {
        return res.status((error as ApiError).code).json({success: false, message: error.message});
    }

    if (error.message && String(error.message).search('canceling statement due to statement timeout') >= 0) {
        return res.status(500).json({
            success: false,
            message: 'Max database query time exceeded. Please try to add more filters to your query.'
        });
    } else {
        logger.warn('Error occured while processing request', error);
    }

    return res.status(500).json({success: false, message: 'Internal Server Error'});
}
