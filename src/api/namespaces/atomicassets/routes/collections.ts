import * as express from 'express';

import { AtomicAssetsNamespace } from '../index';
import { WebServer } from '../../../server';
import { filterQueryArgs } from '../../utils';
import { getLogs } from '../utils';
import logger from '../../../../utils/winston';
import { serializeEosioName } from '../../../../utils/eosio';
import { formatCollection, formatSchema } from '../format';

export function collectionsEndpoints(core: AtomicAssetsNamespace, web: WebServer, router: express.Router): void {
    router.get('/v1/collections', (async (req, res) => {
        try {
            const args = filterQueryArgs(req, {
                page: {type: 'int', min: 1, default: 1},
                limit: {type: 'int', min: 1, max: 100, default: 100},
                sort: {type: 'string', values: ['created'], default: 'created'},
                order: {type: 'string', values: ['asc', 'desc'], default: 'desc'},

                author: {type: 'string', min: 1, max: 12},
                authorized_account: {type: 'string', min: 1, max: 12},
                notify_account: {type: 'string', min: 1, max: 12},

                match: {type: 'string', min: 1}
            });

            let varCounter = 1;
            let queryString = 'SELECT * FROM atomicassets_collections_master WHERE contract = $1 ';

            const queryValues: any[] = [serializeEosioName(core.args.contract)];

            if (args.author) {
                queryString += 'AND author = $' + ++varCounter + ' ';
                queryValues.push(serializeEosioName(args.author));
            }

            if (args.authorized_account) {
                queryString += 'AND $' + ++varCounter + ' = ANY(authorized_accounts) ';
                queryValues.push(serializeEosioName(args.authorized_account));
            }

            if (args.notify_account) {
                queryString += 'AND $' + ++varCounter + ' = ANY(notify_accounts) ';
                queryValues.push(serializeEosioName(args.notify_account));
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

            return res.json({success: true, data: query.rows.map((row) => formatCollection(row))});
        } catch (e) {
            logger.error(e);

            res.status(500);
            res.json({success: false, message: 'Internal Server Error'});
        }
    }));

    router.get('/v1/collections/:collection_name', (async (req, res) => {
        try {
            const query = await core.connection.database.query(
                'SELECT * FROM atomicassets_collections_master WHERE contract = $1 AND collection_name = $2',
                [serializeEosioName(core.args.contract), req.params.collection_name]
            );

            if (query.rowCount === 0) {
                res.status(500);

                return res.json({success: false, message: 'Collection not found'});
            }

            return res.json({success: true, data: formatCollection(query.rows[0])});
        } catch (e) {
            logger.error(e);

            res.status(500);
            return res.json({success: false, message: 'Internal Server Error'});
        }
    }));

    router.get('/v1/collections/:collection_name/logs', (async (req, res) => {
        const args = filterQueryArgs(req, {
            page: {type: 'int', min: 1, default: 1},
            limit: {type: 'int', min: 1, max: 100, default: 100}
        });

        try {
            res.json({
                success: true,
                data: await getLogs(
                    core.connection.database, core.args.contract, 'collection', req.params.collection_name,
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
