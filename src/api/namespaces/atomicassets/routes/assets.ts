import * as express from 'express';

import { AtomicAssetsNamespace } from '../index';
import { WebServer } from '../../../server';
import { buildDataConditions, getLogs } from '../utils';
import { filterQueryArgs } from '../../utils';
import logger from '../../../../utils/winston';
import { serializeEosioName } from '../../../../utils/eosio';
import { formatAsset } from '../format';

export function assetsEndpoints(core: AtomicAssetsNamespace, _: WebServer, router: express.Router): void {
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
                schema_name: {type: 'string', min: 1, max: 12},

                authorized_account: {type: 'string', min: 1, max: 12},
                match: {type: 'string', min: 1}
            });

            let varCounter = 1;
            let queryString = 'SELECT * FROM atomicassets_assets_master asset WHERE contract = $1 ';
            let queryValues: any[] = [serializeEosioName(core.args.contract)];

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
                queryString += 'AND owner = $' + ++varCounter + ' ';
                queryValues.push(serializeEosioName(args.owner));
            }

            if (args.template_id) {
                queryString += 'AND template_id = $' + ++varCounter + ' ';
                queryValues.push(args.template_id);
            }

            if (args.collection_name) {
                queryString += 'AND collection_name = $' + ++varCounter + ' ';
                queryValues.push(serializeEosioName(args.collection_name));
            }

            if (args.schema_name) {
                queryString += 'AND schema_name = $' + ++varCounter + ' ';
                queryValues.push(serializeEosioName(args.schema_name));
            }

            if (args.match) {
                queryString += 'AND name LIKE $' + ++varCounter + ' ';
                queryValues.push('%' + args.match + '%');
            }

            if (args.authorized_account) {
                queryString += 'AND $' + ++varCounter + ' = ANY(authorized_accounts) ';
                queryValues.push(serializeEosioName(args.authorized_account));
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

            return res.json({success: true, data: query.rows.map((row) => formatAsset(row))});
        } catch (e) {
            logger.error(e);

            res.status(500);
            return res.json({success: false, message: 'Internal Server Error'});
        }
    }));

    router.get('/v1/assets/:asset_id', (async (req, res) => {
        try {
            const query = await core.connection.database.query(
                'SELECT * FROM atomicassets_assets_master WHERE contract = $1 AND asset_id = $2',
                [serializeEosioName(core.args.contract), req.params.asset_id]
            );

            if (query.rowCount === 0) {
                res.status(500);

                return res.json({success: false, message: 'Asset not found'});
            }

            return res.json({success: true, data: formatAsset(query.rows[0])});
        } catch (e) {
            logger.error(e);

            res.status(500);
            return res.json({success: false, message: 'Internal Server Error'});
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

            res.status(500);
            return res.json({success: false, message: 'Internal Server Error'});
        }
    }));
}
