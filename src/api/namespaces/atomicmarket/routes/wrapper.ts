import * as express from 'express';
import { respondApiError } from '../../../utils';
import { mergeRequestData, RequestParams } from '../../utils';
import { QueryResult } from 'pg';
import { AtomicMarketNamespace } from '../index';
import { DB, HTTPServer } from '../../../server';

export type HandlerOptions = {
    db: DB,
    core: AtomicMarketNamespace,
};

type JSONWrapperHandler = (params: RequestParams, options: HandlerOptions) => Promise<any>;

export function wrapJSONHandler(handler: JSONWrapperHandler, core: AtomicMarketNamespace, server: HTTPServer): express.RequestHandler {

    return async (req: express.Request, res: express.Response): Promise<void> => {
        try {
            const params = mergeRequestData(req);

            const options = {
                db: {
                    async query<T = any>(queryText: string, values?: any[]): Promise<QueryResult<T>> {
                        return server.query(queryText, values);
                    },
                },
                core,
            };

            const result = await handler(params, options);

            res.json({success: true, data: result, query_time: Date.now()});
        } catch (error) {
            respondApiError(res, error);
        }
    };
}
