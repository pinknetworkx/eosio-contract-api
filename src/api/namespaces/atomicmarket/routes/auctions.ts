import * as express from 'express';

import { AtomicMarketNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { formatAuction } from '../format';
import { fillAuctions } from '../filler';
import { buildAuctionFilter } from '../utils';
import { getOpenAPI3Responses, paginationParameters } from '../../../docs';
import { assetFilterParameters } from '../../atomicassets/openapi';

export function auctionsEndpoints(core: AtomicMarketNamespace, server: HTTPServer, router: express.Router): any {
    router.get('/v1/auctions', server.web.caching(), async (req, res) => {
        const filter = buildAuctionFilter(core.args.atomicmarket_account, req, 1);

        const query = await core.connection.database.query(
            'SELECT * FROM atomicmarket_auctions_master ' +
            'WHERE market_contract = $1 AND auction_id IN (' + filter.str + ')',
            [core.args.atomicmarket_account, ...filter.values]
        );

        const auctions = await fillAuctions(
            core.connection, core.args.atomicmarket_account, query.rows.map((row) => formatAuction(row))
        );

        res.json({status: true, data: auctions});
    });

    router.get('/v1/auctions/:auction_id', server.web.caching(), async (req, res) => {
        const query = await core.connection.database.query(
            'SELECT * FROM atomicmarket_auctions_master WHERE market_contract = $1 AND auction_id = $2',
            [core.args.atomicmarket_account, req.params.auction_id]
        );

        if (query.rowCount === 0) {
            res.status(500).json({success: false, message: 'Auction not found'});
        } else {
            const auctions = await fillAuctions(
                core.connection, core.args.atomicmarket_account, query.rows.map((row) => formatAuction(row))
            );

            res.json({status: true, data: auctions[0]});
        }
    });

    return {
        tag: {
            name: 'auctions',
            description: 'Auctions'
        },
        paths: {
            '/v1/auctions': {
                get: {
                    tags: ['auctions'],
                    summary: 'Get all auctions',
                    parameters: [
                        ...assetFilterParameters,
                        ...paginationParameters
                    ],
                    responses: getOpenAPI3Responses([200], {
                        type: 'array',
                        items: {'$ref': '#/components/schemas/Auction'}
                    })
                }
            },
            '/v1/auctions/{auction_id}': {
                get: {
                    tags: ['auctions'],
                    summary: 'Get a specific auction by id',
                    parameters: [
                        {
                            in: 'path',
                            name: 'auction_id',
                            description: 'Auction Id',
                            required: true,
                            schema: {type: 'integer'}
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 500], {'$ref': '#/components/schemas/Auction'})
                }
            }
        }
    };
}
