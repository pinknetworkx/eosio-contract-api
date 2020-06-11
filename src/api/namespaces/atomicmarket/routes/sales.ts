import * as express from 'express';

import { AtomicMarketNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { buildSaleFilter } from '../utils';
import { fillSales } from '../filler';
import { formatSale } from '../format';
import { assetFilterParameters } from '../../atomicassets/openapi';
import { getOpenAPI3Responses, paginationParameters } from '../../../docs';

export function salesEndpoints(core: AtomicMarketNamespace, server: HTTPServer, router: express.Router): any {
    router.get('/v1/sales', server.web.caching(), async (req, res) => {
        const filter = buildSaleFilter(core.args.atomicmarket_account, req, 1);

        const query = await core.connection.database.query(
            'SELECT * FROM atomicmarket_sales_master ' +
            'WHERE market_contract = $1 AND sale_id IN (' + filter.str + ')',
            [core.args.atomicmarket_account, ...filter.values]
        );

        const sales = await fillSales(
            core.connection, core.args.atomicmarket_account, query.rows.map((row) => formatSale(row))
        );

        res.json({status: true, data: sales});
    });

    router.get('/v1/sales/:sale_id', server.web.caching(), async (req, res) => {
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
                        ...assetFilterParameters,
                        ...paginationParameters
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
