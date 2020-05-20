import * as express from 'express';

import { AtomicAssetsNamespace } from '../index';
import { WebServer } from '../../../server';
import { getLogs } from '../utils';
import { filterQueryArgs } from '../../utils';
import logger from '../../../../utils/winston';
import { serializeEosioName } from '../../../../utils/eosio';
import { formatAsset } from '../format';

export function assetsEndpoints(core: AtomicAssetsNamespace, web: WebServer, router: express.Router): void {
    router.get('/v1/assets', (async (req, res) => {
        try {
            const args = filterQueryArgs(req, {
                page: {type: 'int', min: 1, default: 1},
                limit: {type: 'int', min: 1, max: 100, default: 100},
                sort: {type: 'string', values: ['asset_id', 'updated', 'minted'], default: 'minted'},
                order: {type: 'string', values: ['asc', 'desc'], default: 'desc'},

                owner: {type: 'string', min: 1, max: 12},
                template_id: {type: 'int', min: 0},
                collection_name: {type: 'string', min: 1, max: 12},
                schema_name: {type: 'string', min: 1, max: 12}
            });

            const queryValues: any[] = [serializeEosioName(core.args.contract)];

            let queryString = 'SELECT * FROM atomicassets_assets_master WHERE contract = $1 ';
            let varCounter = 1;

            if (args.owner) {
                queryString += 'AND owner = $' + ++varCounter + ' ';
                queryValues.push(serializeEosioName(args.owner));
            }

            if (args.template_id) {
                queryString += 'AND template->\'template_id\' = $' + ++varCounter + ' ';
                queryValues.push(args.template_id);
            }

            if (args.collection_name) {
                queryString += 'AND collection->>\'collection_name\' = $' + ++varCounter + ' ';
                queryValues.push(serializeEosioName(args.collection_name));
            }

            if (args.schema_name) {
                queryString += 'AND schema->>\'schema_name\' = $' + ++varCounter + ' ';
                queryValues.push(serializeEosioName(args.schema_name));
            }

            const sortColumnMapping = {
                asset_id: 'asset_id',
                updated: 'updated_at_block',
                minted: 'minted_at_block'
            };

            // @ts-ignore
            queryString += 'ORDER BY ' + sortColumnMapping[args.sort] + ' ' + args.order + ' ';
            queryString += 'LIMIT $' + ++varCounter + ' OFFSET $' + ++varCounter + ' ';
            queryValues.push(args.limit);
            queryValues.push((args.page - 1) * args.limit);

            logger.debug(queryString);

            const query = await core.connection.database.query(queryString, queryValues);

            res.json({success: true, data: query.rows.map((row) => formatAsset(row))});
        } catch (e) {
            logger.error(e);

            res.json({success: false});
        }
    }));

    router.get('/v1/assets/:asset_id', (async (req, res) => {
        try {
            const query = await core.connection.database.query(
                'SELECT * FROM atomicassets_assets_master WHERE contract = $1 AND asset_id = $2',
                [serializeEosioName(core.args.contract), req.params.asset_id]
            );

            if (query.rowCount === 0) {
                res.json({success: false});
            } else {
                res.json({success: true, data: formatAsset(query.rows[0])});
            }
        } catch (e) {
            logger.error(e);

            res.json({success: false});
        }
    }));

    router.get('/v1/assets/:asset_id/logs', (async (req, res) => {
        const args = filterQueryArgs(req, {
            page: {type: 'int', min: 1, default: 1},
            limit: {type: 'int', min: 1, max: 100, default: 100}
        });

        try {
            res.json({
                success: true,
                data: await getLogs(
                    core.connection.database, core.args.contract, 'asset', req.params.asset_id,
                    (args.page - 1) * args.limit, args.limit
                )
            });
        } catch (e) {
            logger.error(e);

            res.json({'success': false});
        }
    }));
}
