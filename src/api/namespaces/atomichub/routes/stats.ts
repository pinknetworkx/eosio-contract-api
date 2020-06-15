import * as express from 'express';

import { AtomicHubNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { filterQueryArgs } from '../../utils';
import { getOpenAPI3Responses } from '../../../docs';
import { formatListingAsset, formatSale } from '../../atomicmarket/format';
import { SaleState } from '../../../../filler/handlers/atomicmarket';
import { OfferState } from '../../../../filler/handlers/atomicassets';

export function statsEndpoints(core: AtomicHubNamespace, server: HTTPServer, router: express.Router): any {
    router.get('/v1/stats', server.web.caching({expire: 60, ignoreQueryString: true}), async (_, res) => {
        const nftsQuery = await core.connection.database.query(
            'SELECT COUNT(*) as nfts FROM atomicassets_assets WHERE contract = $1',
            [core.args.atomicassets_account]
        );

        const transfersQuery = await core.connection.database.query(
            'SELECT COUNT(*) as transfers FROM atomicassets_transfers WHERE contract = $1 AND created_at_time >= $2',
            [core.args.atomicassets_account, Date.now() - 3600 * 24 * 1000]
        );

        res.json({
            success: true,
            data: {
                total: {
                    nfts: nftsQuery.rows[0]['nfts']
                },
                today: {
                    transactions: transfersQuery.rows[0]['transfers'],
                    sales_count: 0,
                    sales_volume: 0
                }
            },
            query_time: Date.now()
        });
    });

    router.get('/v1/sales/trending', server.web.caching({expire: 60}), async (req, res) => {
        const args = filterQueryArgs(req, {
            limit: {type: 'int', min: 1, max: 100, default: 10}
        });

        const query = await core.connection.database.query(
            'SELECT * from atomicmarket_sales_master ' +
            'WHERE sale_state = $1 AND offer_state = $2 AND market_contract = $3 AND asset_contract = $4 LIMIT $5',
            [
                SaleState.LISTED.valueOf(), OfferState.PENDING.valueOf(),
                core.args.atomicmarket_account, core.args.atomicassets_account, args.limit
            ]
        );

        // TODO do some market magic to find trending assets

        res.json({
            success: true,
            data: query.rows.map(row => formatSale(row)),
            query_time: Date.now()
        });
    });

    router.get('/v1/suggestions', server.web.caching({expire: 60}), async (req, res) => {
        const args = filterQueryArgs(req, {
            limit: {type: 'int', min: 1, max: 100, default: 10},

            template_id: {type: 'int', min: 0},
            collection_name: {type: 'string', min: 1, max: 12},
            schema_name: {type: 'string', min: 1, max: 12},
            asset_id: {type: 'int', min: 1}
        });

        // TODO filter for only relevant NFTs

        const query = await core.connection.database.query(
            'SELECT * from atomicmarket_assets_master WHERE contract = $1 LIMIT $2',
            [core.args.atomicassets_account, args.limit]
        );

        res.json({
            success: true,
            data: query.rows.map(row => formatListingAsset(row)),
            query_time: Date.now()
        });
    });

    return {
        tag: {
            name: 'stats',
            description: 'Stats'
        },
        paths: {
            '/v1/stats': {
                get: {
                    tags: ['stats'],
                    summary: 'Get general atomicassets / atomicmarket stats',
                    responses: getOpenAPI3Responses([200, 500], {
                        type: 'object',
                        properties: {
                            total: {
                                type: 'object',
                                properties: {
                                    nfts: {type: 'integer'}
                                }
                            },
                            today: {
                                type: 'object',
                                properties: {
                                    transactions: {type: 'integer'},
                                    sales_count: {type: 'integer'},
                                    sales_volume: {type: 'number'}
                                }
                            }
                        }
                    })
                }
            },
            '/v1/sales/trending': {
                get: {
                    tags: ['stats'],
                    summary: 'Get currently trending asset sales',
                    parameters: [
                        {
                            in: 'query',
                            name: 'limit',
                            required: false,
                            schema: {type: 'integer'},
                            description: 'Size of the result'
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 500], {
                        type: 'array',
                        items: {'$ref': '#/components/schemas/Sale'}
                    })
                }
            },
            '/v1/suggestions': {
                get: {
                    tags: ['stats'],
                    summary: 'Get suggestions for the input. More detailed if more info is provided',
                    parameters: [
                        {
                            in: 'query',
                            name: 'limit',
                            required: false,
                            schema: {type: 'integer'},
                            description: 'Size of the result'
                        },
                        {
                            in: 'query',
                            name: 'collection_name',
                            required: false,
                            schema: {type: 'string'},
                            description: 'Filter by collection'
                        },
                        {
                            in: 'query',
                            name: 'schema_name',
                            required: false,
                            schema: {type: 'string'},
                            description: 'Filter by schema'
                        },
                        {
                            in: 'query',
                            name: 'template_id',
                            required: false,
                            schema: {type: 'integer'},
                            description: 'Filter by template'
                        },
                        {
                            in: 'query',
                            name: 'asset_id',
                            required: false,
                            schema: {type: 'integer'},
                            description: 'Get suggestions for a specific asset'
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 500], {
                        type: 'array',
                        items: {'$ref': '#/components/schemas/ListingAsset'}
                    })
                }
            }
        }
    };
}
