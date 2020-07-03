import * as express from 'express';
import PQueue from 'p-queue';

import { AtomicAssetsNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { buildAssetFilter, getLogs } from '../utils';
import { filterQueryArgs } from '../../utils';
import logger from '../../../../utils/winston';
import { getOpenAPI3Responses, paginationParameters } from '../../../docs';
import { assetFilterParameters, atomicDataFilter } from '../openapi';

export class AssetApi {
    constructor(
        readonly core: AtomicAssetsNamespace,
        readonly server: HTTPServer,
        readonly schema: string,
        readonly assetView: string,
        readonly assetFormatter: (_: any) => any
    ) { }

    endpoints(router: express.Router): any {
        router.get('/v1/assets', this.server.web.caching(), (async (req, res) => {
            try {
                const args = filterQueryArgs(req, {
                    page: {type: 'int', min: 1, default: 1},
                    limit: {type: 'int', min: 1, max: 1000, default: 100},
                    sort: {type: 'string', values: ['asset_id', 'updated', 'minted'], default: 'asset_id'},
                    order: {type: 'string', values: ['asc', 'desc'], default: 'desc'},

                    authorized_account: {type: 'string', min: 1, max: 12}
                });

                let varCounter = 1;
                let queryString = 'SELECT * FROM ' + this.assetView + ' asset WHERE contract = $1 ';
                let queryValues: any[] = [this.core.args.atomicassets_account];

                if (args.authorized_account) {
                    queryString += 'AND $' + ++varCounter + ' = ANY(authorized_accounts) ';
                    queryValues.push(args.authorized_account);
                }

                const filter = buildAssetFilter(req, varCounter);

                queryValues = queryValues.concat(filter.values);
                varCounter += filter.values.length;
                queryString += filter.str;

                const sortColumnMapping = {
                    asset_id: 'asset_id',
                    updated: 'updated_at_block',
                    minted: 'asset_id'
                };

                // @ts-ignore
                queryString += 'ORDER BY ' + sortColumnMapping[args.sort] + ' ' + args.order + ' ';
                queryString += 'LIMIT $' + ++varCounter + ' OFFSET $' + ++varCounter + ' ';
                queryValues.push(args.limit);
                queryValues.push((args.page - 1) * args.limit);

                logger.debug(queryString);

                const query = await this.core.connection.database.query(queryString, queryValues);

                return res.json({success: true, data: query.rows.map((row) => this.assetFormatter(row)), query_time: Date.now()});
            } catch (e) {
                logger.error(req.originalUrl + ' ', e);

                return res.status(500).json({success: false, message: 'Internal Server Error'});
            }
        }));

        router.get('/v1/assets/:asset_id', this.server.web.caching({ignoreQueryString: true}), (async (req, res) => {
            try {
                const query = await this.core.connection.database.query(
                    'SELECT * FROM ' + this.assetView + ' WHERE contract = $1 AND asset_id = $2',
                    [this.core.args.atomicassets_account, req.params.asset_id]
                );

                if (query.rowCount === 0) {
                    return res.status(416).json({success: false, message: 'Asset not found'});
                }

                return res.json({success: true, data: this.assetFormatter(query.rows[0]), query_time: Date.now()});
            } catch (e) {
                logger.error(req.originalUrl + ' ', e);

                return res.status(500).json({success: false, message: 'Internal Server Error'});
            }
        }));

        router.get('/v1/assets/:asset_id/stats', this.server.web.caching({ignoreQueryString: true}), (async (req, res) => {
            try {
                const assetQuery = await this.core.connection.database.query(
                    'SELECT * FROM atomicassets_assets WHERE contract = $1 AND asset_id = $2',
                    [this.core.args.atomicassets_account, req.params.asset_id]
                );

                if (assetQuery.rowCount === 0) {
                    return res.status(416).json({success: false, message: 'Asset not found'});
                }

                const asset = assetQuery.rows[0];

                const query = await this.core.connection.database.query(
                    'SELECT ' +
                    '(SELECT COUNT(*) FROM atomicassets_assets WHERE contract = $1 AND asset_id <= $2 AND template_id = $3 AND schema_name = $4 AND collection_name = $5) template_mint, ' +
                    '(SELECT COUNT(*) FROM atomicassets_assets WHERE contract = $1 AND asset_id <= $2 AND schema_name = $4 AND collection_name = $5) schema_mint, ' +
                    '(SELECT COUNT(*) FROM atomicassets_assets WHERE contract = $1 AND asset_id <= $2 AND collection_name = $5) collection_mint',
                    [this.core.args.atomicassets_account, asset.asset_id, asset.template_id, asset.schema_name, asset.collection_name]
                );

                return res.json({success: true, data: query.rows[0]});
            } catch (e) {
                logger.error(req.originalUrl + ' ', e);

                res.status(500).json({success: false, message: 'Internal Server Error'});
            }
        }));

        router.get('/v1/assets/:asset_id/logs', this.server.web.caching(), (async (req, res) => {
            const args = filterQueryArgs(req, {
                page: {type: 'int', min: 1, default: 1},
                limit: {type: 'int', min: 1, max: 100, default: 100},
                order: {type: 'string', values: ['asc', 'desc'], default: 'asc'}
            });

            try {
                res.json({
                    success: true,
                    data: await getLogs(
                        this.core.connection.database, this.core.args.atomicassets_account, 'asset', req.params.asset_id,
                        (args.page - 1) * args.limit, args.limit, args.order
                    ), query_time: Date.now()
                });
            } catch (e) {
                logger.error(e);

                return res.status(500).json({success: false, message: 'Internal Server Error'});
            }
        }));

        return {
            tag: {
                name: 'assets',
                description: 'Assets'
            },
            paths: {
                '/v1/assets': {
                    get: {
                        tags: ['assets'],
                        summary: 'Fetch assets.',
                        description: atomicDataFilter,
                        parameters: [
                            ...assetFilterParameters,
                            {
                                name: 'authorized_account',
                                in: 'query',
                                description: 'Filter for assets the provided account can edit. ',
                                required: false,
                                schema: {
                                    type: 'string'
                                }
                            },
                            ...paginationParameters,
                            {
                                name: 'sort',
                                in: 'query',
                                description: 'Column to sort',
                                required: false,
                                schema: {
                                    type: 'string',
                                    enum: ['asset_id', 'minted', 'updated'],
                                    default: 'asset_id'
                                }
                            }
                        ],
                        responses: getOpenAPI3Responses([200, 500], {type: 'array', items: {'$ref': '#/components/schemas/' + this.schema}})
                    }
                },
                '/v1/assets/{asset_id}': {
                    get: {
                        tags: ['assets'],
                        summary: 'Fetch asset by id',
                        parameters: [
                            {
                                name: 'asset_id',
                                in: 'path',
                                description: 'ID of asset',
                                required: true,
                                schema: {type: 'string'}
                            }
                        ],
                        responses: getOpenAPI3Responses([200, 416, 500], {'$ref': '#/components/schemas/' + this.schema})
                    }
                },
                '/v1/assets/{asset_id}/stats': {
                    get: {
                        tags: ['assets'],
                        summary: 'Fetch asset stats',
                        parameters: [
                            {
                                name: 'asset_id',
                                in: 'path',
                                description: 'ID of asset',
                                required: true,
                                schema: {type: 'integer'}
                            }
                        ],
                        responses: getOpenAPI3Responses([200, 500], {
                            type: 'object',
                            properties: {
                                collection_mint: {type: 'integer'},
                                schema_mint: {type: 'integer'},
                                template_mint: {type: 'integer'}
                            }
                        })
                    }
                },
                '/v1/assets/{asset_id}/logs': {
                    get: {
                        tags: ['assets'],
                        summary: 'Fetch asset logs',
                        parameters: [
                            {
                                name: 'asset_id',
                                in: 'path',
                                description: 'ID of asset',
                                required: true,
                                schema: {type: 'integer'}
                            },
                            ...paginationParameters
                        ],
                        responses: getOpenAPI3Responses([200, 500], {type: 'array', items: {'$ref': '#/components/schemas/Log'}})
                    }
                }
            }
        };
    }

    sockets(): void {
        const namespace = this.server.socket.io.of(this.core.path + '/v1/assets');

        namespace.on('connection', async (socket) => {
            logger.debug('socket asset client connected');

            let verifiedConnection = false;
            if (!(await this.server.socket.reserveConnection(socket))) {
                socket.disconnect(true);
            } else {
                verifiedConnection = true;
            }

            socket.on('disconnect', async () => {
                if (verifiedConnection) {
                    await this.server.socket.releaseConnection(socket);
                }
            });
        });

        const queue = new PQueue({
            autoStart: true,
            concurrency: 1
        });

        const assetChannelName = [
            'eosio-contract-api', this.core.connection.chain.name, this.core.args.connected_reader,
            'atomicassets', this.core.args.atomicassets_account, 'assets'
        ].join(':');
        this.core.connection.redis.ioRedisSub.subscribe(assetChannelName, () => {
            this.core.connection.redis.ioRedisSub.on('message', async (channel, message) => {
                if (channel !== assetChannelName) {
                    return;
                }

                const msg = JSON.parse(message);

                await queue.add(async () => {
                    const query = await this.core.connection.database.query(
                        'SELECT * FROM atomicassets_assets_master WHERE contract = $1 AND asset_id = $2',
                        [this.core.args.atomicassets_account, msg.data.asset_id]
                    );

                    if (query.rowCount === 0) {
                        logger.error('Received asset notification but did not find it in database');

                        return;
                    }

                    const asset = query.rows[0];

                    if (msg.action === 'mint') {
                        namespace.emit('new_asset', {
                            transaction: msg.transaction,
                            block: msg.block,
                            asset: this.assetFormatter(asset)
                        });
                    } else if (msg.action === 'burn') {
                        namespace.emit('burn', {
                            transaction: msg.transaction,
                            block: msg.block,
                            asset: this.assetFormatter(asset)
                        });
                    } else if (msg.action === 'back') {
                        namespace.emit('back', {
                            transaction: msg.transaction,
                            block: msg.block,
                            asset: this.assetFormatter(asset),
                            trace: msg.data.trace
                        });
                    } else if (msg.action === 'update') {
                        namespace.emit('update', {
                            transaction: msg.transaction,
                            block: msg.block,
                            asset: this.assetFormatter(asset),
                            delta: msg.data.delta
                        });
                    }
                });
            });
        });
    }
}
