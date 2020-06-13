import * as express from 'express';

import { AtomicMarketNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { buildSaleFilter } from '../utils';
import { fillSales } from '../filler';
import { formatSale } from '../format';
import { assetFilterParameters } from '../../atomicassets/openapi';
import { getOpenAPI3Responses, paginationParameters } from '../../../docs';
import logger from '../../../../utils/winston';
import { filterQueryArgs } from '../../utils';
import { listingFilterParameters } from '../openapi';

export function salesEndpoints(core: AtomicMarketNamespace, server: HTTPServer, router: express.Router): any {
    router.get('/v1/sales', server.web.caching(), async (req, res) => {
        try {
            const args = filterQueryArgs(req, {
                page: {type: 'int', min: 1, default: 1},
                limit: {type: 'int', min: 1, max: 100, default: 100},
                sort: {type: 'string', values: ['created', 'sale_id', 'price'], default: 'created'},
                order: {type: 'string', values: ['asc', 'desc'], default: 'desc'}
            });

            const filter = buildSaleFilter(req, 1);

            let queryString = 'SELECT * FROM atomicmarket_sales_master listing WHERE market_contract = $1 ' + filter.str;
            const queryValues = [core.args.atomicmarket_account, ...filter.values];
            let varCounter = queryValues.length;

            const sortColumnMapping = {
                sale_id: 'sale_id',
                created: 'created_at_block',
                price: 'raw_price'
            };

            // @ts-ignore
            queryString += 'ORDER BY ' + sortColumnMapping[args.sort] + ' ' + args.order + ' ';
            queryString += 'LIMIT $' + ++varCounter + ' OFFSET $' + ++varCounter + ' ';
            queryValues.push(args.limit);
            queryValues.push((args.page - 1) * args.limit);

            logger.debug(queryString);

            const query = await core.connection.database.query(queryString, queryValues);

            const sales = await fillSales(
                core.connection, core.args.atomicmarket_account, query.rows.map((row) => formatSale(row))
            );

            res.json({status: true, data: sales});
        } catch (e) {
            logger.error(e);

            res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    });

    router.get('/v1/sales/:sale_id', server.web.caching(), async (req, res) => {
        try {
            const query = await core.connection.database.query(
                'SELECT * FROM atomicmarket_sales_master WHERE market_contract = $1 AND sale_id = $2',
                [core.args.atomicmarket_account, req.params.sale_id]
            );

            if (query.rowCount === 0) {
                res.status(500).json({success: false, message: 'Sale not found'});
            } else {
                const sales = await fillSales(
                    core.connection, core.args.atomicmarket_account, query.rows.map((row) => formatSale(row))
                );

                res.json({status: true, data: sales[0]});
            }
        } catch (e) {
            logger.error(e);

            res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    });

    return {
        tag: {
            name: 'sales',
            description: 'Sales'
        },
        paths: {
            '/v1/sales': {
                get: {
                    tags: ['sales'],
                    summary: 'Get all sales',
                    parameters: [
                        {
                            name: 'state',
                            in: 'query',
                            description: 'Filter by sale state (0: Listed, 1: Invalid, 2: Sold, 3: Waiting for assets) - separate multiple with ","',
                            required: false,
                            schema: {type: 'string'}
                        },
                        ...listingFilterParameters,
                        ...assetFilterParameters,
                        ...paginationParameters,
                        {
                            name: 'sort',
                            in: 'query',
                            description: 'Column to sort',
                            required: false,
                            schema: {
                                type: 'string',
                                enum: ['created', 'sale_id', 'price'],
                                default: 'created'
                            }
                        }
                    ],
                    responses: getOpenAPI3Responses([200], {
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
                    responses: getOpenAPI3Responses([200, 500], {'$ref': '#/components/schemas/Sale'})
                }
            }
        }
    };
}
