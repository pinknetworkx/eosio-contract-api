import * as express from 'express';
import PQueue from 'p-queue';

import { AtomicMarketNamespace, SaleApiState } from '../index';
import { HTTPServer } from '../../../server';
import { buildSaleFilter } from '../utils';
import { fillSales } from '../filler';
import { formatSale } from '../format';
import { assetFilterParameters, atomicDataFilter } from '../../atomicassets/openapi';
import { dateBoundaryParameters, getOpenAPI3Responses, paginationParameters, primaryBoundaryParameters } from '../../../docs';
import logger from '../../../../utils/winston';
import { buildBoundaryFilter, filterQueryArgs } from '../../utils';
import { listingFilterParameters } from '../openapi';
import { OfferState } from '../../../../filler/handlers/atomicassets';
import { buildGreylistFilter, getLogs } from '../../atomicassets/utils';

export function salesEndpoints(core: AtomicMarketNamespace, server: HTTPServer, router: express.Router): any {
    router.get(['/v1/sales', '/v1/sales/_count'], server.web.caching(), async (req, res) => {
        try {
            const args = filterQueryArgs(req, {
                page: {type: 'int', min: 1, default: 1},
                limit: {type: 'int', min: 1, max: 100, default: 100},
                sort: {
                    type: 'string',
                    values: [
                        'created', 'updated', 'sale_id', 'price',
                        'template_mint', 'schema_mint', 'collection_mint'
                    ],
                    default: 'created'
                },
                order: {type: 'string', values: ['asc', 'desc'], default: 'desc'}
            });

            const filter = buildSaleFilter(req, 1);

            let queryString = `
                SELECT listing.sale_id 
                FROM atomicmarket_sales listing 
                    JOIN atomicassets_offers offer ON (listing.assets_contract = offer.contract AND listing.offer_id = offer.offer_id)
                    LEFT JOIN atomicmarket_sale_prices price ON (price.market_contract = listing.market_contract AND price.sale_id = listing.sale_id)
                    LEFT JOIN atomicmarket_sale_mints mint ON (mint.market_contract = listing.market_contract AND mint.sale_id = listing.sale_id)
                WHERE listing.market_contract = $1 ` + filter.str;
            const queryValues = [core.args.atomicmarket_account, ...filter.values];
            let varCounter = queryValues.length;

            const blacklistFilter = buildGreylistFilter(req, varCounter, 'listing.collection_name');
            queryValues.push(...blacklistFilter.values);
            varCounter += blacklistFilter.values.length;
            queryString += blacklistFilter.str;

            const boundaryFilter = buildBoundaryFilter(
                req, varCounter, 'listing.sale_id', 'int',
                args.sort === 'updated' ? 'listing.updated_at_time' : 'listing.created_at_time',
                args.sort === 'updated' ? 'listing.updated_at_block' : 'listing.created_at_block'
            );
            queryValues.push(...boundaryFilter.values);
            varCounter += boundaryFilter.values.length;
            queryString += boundaryFilter.str;

            if (req.originalUrl.search('/_count') >= 0) {
                const countQuery = await this.server.query(
                    'SELECT COUNT(*) counter FROM (' + queryString + ') x',
                    queryValues
                );

                return res.json({success: true, data: countQuery.rows[0].counter, query_time: Date.now()});
            }

            const sortColumnMapping = {
                sale_id: 'listing.sale_id',
                created: 'listing.sale_id',
                updated: 'listing.updated_at_block',
                price: 'price.price',
                template_mint: 'mint.min_template_mint',
                schema_mint: 'mint.min_schema_mint',
                collection_mint: 'mint.min_collection_mint'
            };

            // @ts-ignore
            queryString += 'ORDER BY ' + sortColumnMapping[args.sort] + ' ' + args.order + ' NULLS LAST, listing.sale_id ASC ';
            queryString += 'LIMIT $' + ++varCounter + ' OFFSET $' + ++varCounter + ' ';
            queryValues.push(args.limit);
            queryValues.push((args.page - 1) * args.limit);

            const saleQuery = await server.query(queryString, queryValues);

            const saleLookup: {[key: string]: any} = {};
            const query = await server.query(
                'SELECT * FROM atomicmarket_sales_master WHERE market_contract = $1 AND sale_id = ANY ($2)',
                [core.args.atomicmarket_account, saleQuery.rows.map(row => row.sale_id)]
            );

            query.rows.reduce((prev, current) => {
                prev[String(current.sale_id)] = current;

                return prev;
            }, saleLookup);

            const sales = await fillSales(
                server, core.args.atomicassets_account, saleQuery.rows.map((row) => formatSale(saleLookup[String(row.sale_id)]))
            );

            res.json({success: true, data: sales, query_time: Date.now()});
        } catch (e) {
            res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    });

    router.get('/v1/sales/:sale_id', server.web.caching(), async (req, res) => {
        try {
            const query = await server.query(
                'SELECT * FROM atomicmarket_sales_master WHERE market_contract = $1 AND sale_id = $2',
                [core.args.atomicmarket_account, req.params.sale_id]
            );

            if (query.rowCount === 0) {
                res.status(416).json({success: false, message: 'Sale not found'});
            } else {
                const sales = await fillSales(
                    server, core.args.atomicassets_account, query.rows.map((row) => formatSale(row))
                );

                res.json({success: true, data: sales[0], query_time: Date.now()});
            }
        } catch (e) {
            res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    });

    router.get('/v1/sales/:sale_id/logs', server.web.caching(), (async (req, res) => {
        const args = filterQueryArgs(req, {
            page: {type: 'int', min: 1, default: 1},
            limit: {type: 'int', min: 1, max: 100, default: 100},
            order: {type: 'string', values: ['asc', 'desc'], default: 'asc'}
        });

        try {
            res.json({
                success: true,
                data: await getLogs(
                    server, core.args.atomicmarket_account, 'sale', req.params.sale_id,
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
            name: 'sales',
            description: 'Sales'
        },
        paths: {
            '/v1/sales': {
                get: {
                    tags: ['sales'],
                    summary: 'Get all sales. ',
                    description: atomicDataFilter,
                    parameters: [
                        {
                            name: 'state',
                            in: 'query',
                            description: 'Filter by sale state (' +
                                SaleApiState.WAITING.valueOf() + ': WAITING - Sale created but offer was not send yet, ' +
                                SaleApiState.LISTED.valueOf() + ': LISTED - Assets for sale, ' +
                                SaleApiState.CANCELED.valueOf() + ': CANCELED - Sale was canceled, ' +
                                SaleApiState.SOLD.valueOf() + ': SOLD - Sale was bought' +
                                SaleApiState.INVALID.valueOf() + ': INVALID - Sale is still listed but offer is currently invalid (can become valid again if the user owns all assets again)' +
                                ') - separate multiple with ","',
                            required: false,
                            schema: {type: 'string'}
                        },
                        ...listingFilterParameters,
                        ...assetFilterParameters,
                        ...primaryBoundaryParameters,
                        ...dateBoundaryParameters,
                        ...paginationParameters,
                        {
                            name: 'sort',
                            in: 'query',
                            description: 'Column to sort',
                            required: false,
                            schema: {
                                type: 'string',
                                enum: [
                                    'created', 'updated', 'sale_id', 'price',
                                    'template_mint', 'schema_mint', 'collection_mint'
                                ],
                                default: 'created'
                            }
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 500], {
                        type: 'array',
                        items: {'$ref': '#/components/schemas/Sale'}
                    })
                }
            },
            '/v1/sales/{sale_id}': {
                get: {
                    tags: ['sales'],
                    summary: 'Get a specific sale by id',
                    parameters: [
                        {
                            in: 'path',
                            name: 'sale_id',
                            description: 'Sale Id',
                            required: true,
                            schema: {type: 'integer'}
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 416, 500], {'$ref': '#/components/schemas/Sale'})
                }
            },
            '/v1/sales/{sale_id}/logs': {
                get: {
                    tags: ['sales'],
                    summary: 'Fetch sale logs',
                    parameters: [
                        {
                            name: 'sale_id',
                            in: 'path',
                            description: 'ID of sale',
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

export function salesSockets(core: AtomicMarketNamespace, server: HTTPServer): void {
    const namespace = server.socket.io.of(core.path + '/v1/sales');

    namespace.on('connection', async (socket) => {
        logger.debug('socket sale client connected');

        let verifiedConnection = false;
        if (!(await server.socket.reserveConnection(socket))) {
            socket.disconnect(true);
        } else {
            verifiedConnection = true;
        }

        socket.on('disconnect', async () => {
            if (verifiedConnection) {
                await server.socket.releaseConnection(socket);
            }
        });
    });

    const queue = new PQueue({
        autoStart: true,
        concurrency: 1
    });

    const saleChannelName = [
        'eosio-contract-api', core.connection.chain.name, core.args.connected_reader,
        'atomicmarket', core.args.atomicmarket_account, 'sales'
    ].join(':');
    core.connection.redis.ioRedisSub.setMaxListeners(core.connection.redis.ioRedisSub.getMaxListeners() + 1);
    core.connection.redis.ioRedisSub.subscribe(saleChannelName, () => {
        core.connection.redis.ioRedisSub.on('message', async (channel, message) => {
            if (channel !== saleChannelName) {
                return;
            }

            const msg = JSON.parse(message);

            await queue.add(async () => {
                const query = await server.query(
                    'SELECT * FROM atomicmarket_sales_master WHERE market_contract = $1 AND sale_id = $2',
                    [core.args.atomicmarket_account, msg.data.sale_id]
                );

                if (query.rowCount === 0) {
                    logger.error('Received sale notification but did not find sale in database');

                    return;
                }

                const sales = await fillSales(
                    server, core.args.atomicassets_account,
                    query.rows.map((row: any) => formatSale(row))
                );

                const sale = sales[0];

                if (msg.action === 'create') {
                    namespace.emit('new_sale', {
                        transaction: msg.transaction,
                        block: msg.block,
                        sale_id: sale.sale_id,
                        sale: sale
                    });
                } else if (msg.action === 'state_change') {
                    namespace.emit('state_change', {
                        transaction: msg.transaction,
                        block: msg.block,
                        sale_id: sale.sale_id,
                        state: sale.state,
                        sale: sale
                    });
                }
            });
        });
    });

    const offerChannelName = [
        'eosio-contract-api', core.connection.chain.name, core.args.connected_reader,
        'atomicassets', core.args.atomicassets_account, 'offers'
    ].join(':');
    core.connection.redis.ioRedisSub.setMaxListeners(core.connection.redis.ioRedisSub.getMaxListeners() + 1);
    core.connection.redis.ioRedisSub.subscribe(offerChannelName, () => {
        core.connection.redis.ioRedisSub.on('message', async (channel, message) => {
            if (channel !== offerChannelName) {
                return;
            }

            const msg = JSON.parse(message);

            logger.debug('received sales notification', msg);

            if (msg.action === 'state_change') {
                if ([OfferState.PENDING.valueOf(), OfferState.INVALID.valueOf()].indexOf(parseInt(msg.data.state, 10)) === -1) {
                    return;
                }

                await queue.add(async () => {
                    const sales = await server.query(
                        'SELECT * FROM atomicmarket_sales_master WHERE market_contract = $1 AND offer_id = $2',
                        [core.args.atomicmarket_account, msg.data.offer_id]
                    );

                    for (const sale of sales.rows) {
                        namespace.emit('state_change', {
                            transaction: msg.transaction,
                            block: msg.block,
                            sale_id: msg.data.sale_id,
                            state: sale.state,
                            sale: formatSale(sale)
                        });
                    }
                });
            }
        });
    });

    server.socket.addForkSubscription(core.args.connected_reader, namespace);
}
