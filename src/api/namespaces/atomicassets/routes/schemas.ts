import * as express from 'express';

import { AtomicAssetsNamespace } from '../index';
import { WebServer } from '../../../server';
import { filterQueryArgs } from '../../utils';
import { getLogs } from '../utils';
import logger from '../../../../utils/winston';
import { formatSchema } from '../format';

export function schemasEndpoints(core: AtomicAssetsNamespace, _: WebServer, router: express.Router): void {
    async function schemaRequestHandler(req: express.Request, res: express.Response): Promise<any> {
        try {
            const args = filterQueryArgs(req, {
                page: {type: 'int', min: 1, default: 1},
                limit: {type: 'int', min: 1, max: 100, default: 100},
                sort: {type: 'string', values: ['created'], default: 'created'},
                order: {type: 'string', values: ['asc', 'desc'], default: 'desc'},

                authorized_account: {type: 'string', min: 1, max: 12},
                collection_name: {type: 'string', min: 1, max: 12}
            });

            if (typeof req.params.collection_name === 'string' && req.params.collection_name.length > 0) {
                args.collection_name = req.params.collection_name;
            }

            let varCounter = 1;
            let queryString = 'SELECT * FROM atomicassets_schemas_master WHERE contract = $1 ';

            const queryValues: any[] = [core.args.contract];

            if (args.collection_name) {
                queryString += 'AND collection_name = $' + ++varCounter + ' ';
                queryValues.push(args.collection_name);
            }

            if (args.authorized_account) {
                queryString += 'AND $' + ++varCounter + ' = ANY(authorized_accounts) ';
                queryValues.push(args.authorized_account);
            }

            const sortColumnMapping = {
                created: 'created_at_block'
            };

            // @ts-ignore
            queryString += 'ORDER BY ' + sortColumnMapping[args.sort] + ' ' + args.order + ' ';
            queryString += 'LIMIT $' + ++varCounter + ' OFFSET $' + ++varCounter + ' ';
            queryValues.push(args.limit);
            queryValues.push((args.page - 1) * args.limit);

            logger.debug(queryString);

            const query = await core.connection.database.query(queryString, queryValues);

            return res.json({success: true, data: query.rows.map((row) => formatSchema(row))});
        } catch (e) {
            logger.error(e);

            res.status(500);
            res.json({success: false, message: 'Internal Server Error'});
        }
    }

    router.get('/v1/schemas', schemaRequestHandler);
    router.get('/v1/schemas/:collection_name', schemaRequestHandler);

    router.get('/v1/schemas/:collection_name/:schema_name', (async (req, res) => {
        try {
            const query = await core.connection.database.query(
                'SELECT * FROM atomicassets_schemas_master WHERE contract = $1 AND collection_name = $2 AND schema_name = $3',
                [core.args.contract, req.params.collection_name, req.params.schema_name]
            );

            if (query.rowCount === 0) {
                res.status(500);
                return res.json({success: false, message: 'Schema not found'});
            }

            return res.json({success: true, data: formatSchema(query.rows[0])});
        } catch (e) {
            logger.error(e);

            res.status(500);
            res.json({success: false, message: 'Internal Server Error'});
        }
    }));

    router.get('/v1/schemas/:collection_name/:schema_name/logs', (async (req, res) => {
        const args = filterQueryArgs(req, {
            page: {type: 'int', min: 1, default: 1},
            limit: {type: 'int', min: 1, max: 100, default: 100}
        });

        try {
            res.json({
                success: true,
                data: await getLogs(
                    core.connection.database, core.args.contract, 'schema',
                    req.params.collection_name + ':' + req.params.schema_name,
                    (args.page - 1) * args.limit, args.limit
                )
            });
        } catch (e) {
            logger.error(e);

            res.status(500);
            return res.json({success: false, message: 'Internal Server Error'});
        }
    }));
}
