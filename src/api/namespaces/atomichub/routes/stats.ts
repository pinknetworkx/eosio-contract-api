import * as express from 'express';

import { AtomicHubNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { filterQueryArgs } from '../../utils';
import { getOpenAPI3Responses } from '../../../docs';
import { formatListingAsset, formatSale } from '../../atomicmarket/format';
import { AuctionState, SaleState } from '../../../../filler/handlers/atomicmarket';
import { OfferState } from '../../../../filler/handlers/atomicassets';
import { fillSales } from '../../atomicmarket/filler';
import { fillAssets } from '../../atomicassets/filler';
import { greylistFilterParameters } from '../../atomicassets/openapi';

export function statsEndpoints(core: AtomicHubNamespace, server: HTTPServer, router: express.Router): any {
    async function fetchSymbol(symbol: string): Promise<{token_symbol: string, token_contract: string, token_precision: number}> {
        if (!symbol) {
            return null;
        }

        const query = await server.query(
            'SELECT token_symbol, token_contract, token_precision FROM atomicassets_tokens WHERE contract = $1 AND token_symbol = $2',
            [core.args.atomicassets_account, symbol]
        );

        if (query.rows.length === 0) {
            return null;
        }

        return query.rows[0];
    }

    router.all('/v1/stats', server.web.caching({expire: 60}), async (req, res) => {
        try {
            const args = filterQueryArgs(req, {
                collection_whitelist: {type: 'string', min: 1, default: ''},
                collection_blacklist: {type: 'string', min: 1, default: ''},

                symbol: {type: 'string', min: 1, max: 12, default: core.args.default_symbol}
            });

            const nftsQuery = await server.query(
                'SELECT COUNT(*) as nfts FROM atomicassets_assets WHERE contract = $1 AND ' +
                '(collection_name = ANY ($2) OR CARDINALITY($2) = 0) AND (NOT (collection_name = ANY ($3)) OR CARDINALITY($3) = 0)',
                [
                    core.args.atomicassets_account,
                    args.collection_whitelist.split(',').filter((x: string) => !!x),
                    args.collection_blacklist.split(',').filter((x: string) => !!x)
                ]
            );

            let transfersQueryString = 'SELECT COUNT(*) as transfers FROM atomicassets_transfers transfer WHERE contract = $1 AND created_at_time >= $2 ';
            const transfersQueryValues = [core.args.atomicassets_account, Date.now() - 3600 * 24 * 1000];

            if (args.collection_whitelist) {
                transfersQueryValues.push(args.collection_whitelist.split(','));
                transfersQueryString += 'AND EXISTS (' +
                    'SELECT * FROM atomicassets_transfers_assets transfer_asset, atomicassets_assets asset ' +
                    'WHERE transfer.contract = transfer_asset.contract AND transfer.transfer_id = transfer_asset.transfer_id AND ' +
                    'transfer_asset.contract = asset.contract AND transfer_asset.asset_id = asset.asset_id AND ' +
                    'asset.collection_name = ANY ($' + transfersQueryValues.length + ')) ';
            }

            if (args.collection_blacklist) {
                transfersQueryValues.push(args.collection_blacklist.split(','));
                transfersQueryString += 'AND NOT EXISTS (' +
                    'SELECT * FROM atomicassets_transfers_assets transfer_asset, atomicassets_assets asset ' +
                    'WHERE transfer.contract = transfer_asset.contract AND transfer.transfer_id = transfer_asset.transfer_id AND ' +
                    'transfer_asset.contract = asset.contract AND transfer_asset.asset_id = asset.asset_id AND ' +
                    'asset.collection_name = ANY ($' + transfersQueryValues.length + ')) ';
            }

            const transfersQuery = await server.query(transfersQueryString, transfersQueryValues);

            const salesQuery = await server.query(
                'SELECT COUNT(*) "count", SUM(final_price) volume FROM atomicmarket_sales ' +
                'WHERE market_contract = $1 AND state = ' + SaleState.SOLD.valueOf() + ' AND ' +
                'updated_at_time >= ' + (Date.now() - 3600 * 24 * 1000) + ' AND ' +
                'settlement_symbol = $2 AND (collection_name = ANY ($3) OR CARDINALITY($3) = 0) AND (NOT (collection_name = ANY ($4)) OR CARDINALITY($4) = 0)',
                [
                    core.args.atomicmarket_account,
                    args.symbol.toUpperCase(),
                    args.collection_whitelist.split(',').filter((x: string) => !!x),
                    args.collection_blacklist.split(',').filter((x: string) => !!x)
                ]
            );

            const auctionsQuery = await server.query(
                'SELECT COUNT(*) "count", SUM(price) volume FROM atomicmarket_auctions ' +
                'WHERE market_contract = $1 AND state = ' + AuctionState.LISTED.valueOf() + ' AND token_symbol = $2 AND ' +
                'end_time >= ' + ((Date.now() - 3600 * 24 * 1000) / 1000) + ' AND end_time < ' + (Date.now() / 1000) + ' AND ' +
                'buyer IS NOT NULL AND ' +
                '(collection_name = ANY ($3) OR CARDINALITY($3) = 0) AND (NOT (collection_name = ANY ($4)) OR CARDINALITY($4) = 0)',
                [
                    core.args.atomicmarket_account,
                    args.symbol.toUpperCase(),
                    args.collection_whitelist.split(',').filter((x: string) => !!x),
                    args.collection_blacklist.split(',').filter((x: string) => !!x)
                ]
            );

            const symbolQuery = await server.query(
                'SELECT token_contract, token_symbol, token_precision FROM atomicmarket_tokens WHERE market_contract = $1 AND token_symbol = $2',
                [core.args.atomicmarket_account, args.symbol]
            );

            if (symbolQuery.rowCount === 0) {
                return res.status(416).json({success: false, message: 'Symbol not found'});
            }

            res.json({
                success: true,
                data: {
                    symbol: symbolQuery.rows[0],
                    total: {
                        nfts: nftsQuery.rows[0]['nfts']
                    },
                    today: {
                        transactions: transfersQuery.rows[0]['transfers'],
                        sales_count: salesQuery.rows[0]['count'],
                        sales_volume: salesQuery.rows[0]['volume'],
                        auctions_count: auctionsQuery.rows[0]['count'],
                        auctions_volume: auctionsQuery.rows[0]['volume']
                    }
                },
                query_time: Date.now()
            });
        } catch (e) {
            return res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    });

    router.all('/v1/assets/suggestions', server.web.caching({expire: 60}), async (req, res) => {
        try {
            const args = filterQueryArgs(req, {
                limit: {type: 'int', min: 1, max: 100, default: 10},

                template_id: {type: 'int', min: 0},
                collection_name: {type: 'string', min: 1, max: 12},
                schema_name: {type: 'string', min: 1, max: 12},
                asset_id: {type: 'int', min: 1}
            });

            if (args.asset_id) {
                const asset = await server.query(
                    'SELECT template_id, collection_name, schema_name FROM atomicassets_assets ' +
                    'WHERE contract = $1 AND asset_id = $2',
                    [core.args.atomicassets_account, args.asset_id]
                );

                if (asset.rowCount === 0) {
                    return res.status(416).json({success: false, message: 'Asset ID not found'});
                }

                args.template_id = asset.rows[0].template_id;
                args.collection_name = asset.rows[0].collection_name;
                args.schema_name = asset.rows[0].schema_name;
            }

            let assets = [];
            for (let i = 0; i <= 3 && assets.length === 0; i++) {
                const queryValues = [core.args.atomicassets_account];
                let queryString = 'SELECT asset_id from atomicassets_assets WHERE contract = $1 AND owner IS NOT NULL ';

                if (args.template_id && i <= 0) {
                    queryValues.push(args.template_id);
                    queryString += 'AND template_id = $' + queryValues.length + ' ';
                }

                if (args.schema_name && i <= 1) {
                    queryValues.push(args.schema_name);
                    queryString += 'AND schema_name = $' + queryValues.length + ' ';
                }

                if (args.collection_name && i <= 2) {
                    queryValues.push(args.collection_name);
                    queryString += 'AND collection_name = $' + queryValues.length + ' ';
                }

                if (args.asset_id) {
                    queryValues.push(args.asset_id);
                    queryString += 'AND asset_id != $' + queryValues.length + ' ';
                }

                queryValues.push(args.limit);
                queryString += 'ORDER BY minted_at_block DESC LIMIT $' + queryValues.length;

                const query = await server.query(queryString, queryValues);

                assets = await fillAssets(
                    server, core.args.atomicassets_account,
                    query.rows.map(row => row.asset_id),
                    formatListingAsset, 'atomicassets_assets_master'
                );
            }

            res.json({
                success: true,
                data: assets,
                query_time: Date.now()
            });
        } catch (e) {
            return res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    });

    router.all('/v1/sales/suggestions', server.web.caching({expire: 60}), async (req, res) => {
        try {
            const args = filterQueryArgs(req, {
                limit: {type: 'int', min: 1, max: 100, default: 10},
                symbol: {type: 'string', min: 1, max: 12},

                template_id: {type: 'int', min: 0},
                collection_name: {type: 'string', min: 1, max: 12},
                schema_name: {type: 'string', min: 1, max: 12},
                asset_id: {type: 'int', min: 1},

                sale_id: {type: 'int', min: 1}
            });

            if (args.sale_id) {
                const dataQuery = await server.query(
                    'SELECT * FROM atomicmarket_sales_master WHERE market_contract = $1 AND sale_id = $2',
                    [core.args.atomicmarket_account, args.sale_id]
                );

                if (dataQuery.rowCount === 0) {
                    return res.status(416).json({success: false, message: 'Sale not found'});
                }

                const sale = await fillSales(server, core.args.atomicassets_account, dataQuery.rows.map((row) => formatSale(row)));

                if (sale[0].assets[0].template) {
                    args.template_id = sale[0].assets[0].template.template_id;
                }

                args.collection_name = sale[0].assets[0].collection.collection_name;
                args.schema_name = sale[0].assets[0].schema.schema_name;
                args.asset_id = sale[0].assets[0].asset_id;
                args.symbol = sale[0].price.token_symbol;
            }

            let saleQuery: any = {rowCount: 0, rows: []};
            for (let i = 0; i <= 3 && saleQuery.rows.length === 0; i++) {
                const queryValues = [core.args.atomicmarket_account, args.sale_id ? args.sale_id : null, args.symbol];
                let queryString = 'SELECT listing.sale_id ' +
                    'FROM atomicmarket_sales listing ' +
                    'JOIN atomicassets_offers offer ON (listing.assets_contract = offer.contract AND listing.offer_id = offer.offer_id) ' +
                    'LEFT JOIN atomicmarket_sale_prices price ON (price.market_contract = listing.market_contract AND price.sale_id = listing.sale_id) ' +
                    'WHERE ' +
                    'listing.market_contract = $1 AND listing.sale_id != $2 AND ' +
                    'listing.settlement_symbol = $3 AND ' +
                    'listing.state = ' + SaleState.LISTED.valueOf() + ' AND ' +
                    'offer.state = ' + OfferState.PENDING.valueOf() + ' AND ' +
                    'EXISTS (' +
                    'SELECT * FROM atomicassets_offers_assets offer_asset, atomicassets_assets asset ' +
                    'WHERE offer_asset.offer_id = listing.offer_id AND offer_asset.contract = listing.assets_contract AND ' +
                    'offer_asset.contract = asset.contract AND offer_asset.asset_id = asset.asset_id ';

                if (args.template_id && i <= 0) {
                    queryValues.push(args.template_id);
                    queryString += 'AND asset.template_id = $' + queryValues.length + ' ';
                }

                if (args.schema_name && i <= 1) {
                    queryValues.push(args.schema_name);
                    queryString += 'AND asset.schema_name = $' + queryValues.length + ' ';
                }

                if (args.collection_name && i <= 2) {
                    queryValues.push(args.collection_name);
                    queryString += 'AND asset.collection_name = $' + queryValues.length + ' ';
                }

                queryValues.push(args.limit);
                queryString += ') ORDER BY price.price ASC LIMIT $' + queryValues.length;

                saleQuery = await server.query(queryString, queryValues);
            }

            const saleLookup: {[key: string]: any} = {};
            const query = await server.query(
                'SELECT * FROM atomicmarket_sales_master WHERE market_contract = $1 AND sale_id = ANY ($2)',
                [core.args.atomicmarket_account, saleQuery.rows.map((row: any) => row.sale_id)]
            );

            query.rows.reduce((prev, current) => {
                prev[String(current.sale_id)] = current;

                return prev;
            }, saleLookup);

            const sales = await fillSales(
                server, core.args.atomicassets_account,
                saleQuery.rows.map((row: any) => formatSale(saleLookup[String(row.sale_id)]))
            );

            res.json({
                success: true,
                data: sales,
                query_time: Date.now()
            });
        } catch (e) {
            return res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    });

    router.all('/v1/giveaway', server.web.caching(), async (req, res) => {
        try {
            const args = filterQueryArgs(req, {
                symbol: {type: 'string', min: 1},

                after: {type: 'int', min: 0, default: 0},
                before: {type: 'int', min: 0, default: Date.now()},

                multiplier_amount: {type: 'int', min: 0, default: 0},
                multiplier_frame: {type: 'int', min: 0, default: 0},

                marketplace: {type: 'string'},
                collection_name: {type: 'string', min: 1}
            });

            const symbol = await fetchSymbol(args.symbol);

            if (symbol === null) {
                return res.status(500).json({success: false, message: 'Symbol not found'});
            }

            const queryString = `
                SELECT account, SUM (x.amount) amount, SUM(x.bonus) bonus
                FROM (
                    (
                        SELECT 
                            seller account, 
                            SUM(final_price) amount, 
                            SUM(final_price) FILTER (WHERE sale.updated_at_time > $5) "bonus"
                        FROM atomicmarket_sales sale 
                        WHERE sale.market_contract = $1 AND sale.settlement_symbol = $2 AND sale.state = ${SaleState.SOLD.valueOf()}
                            AND sale.updated_at_time > $3 AND sale.updated_at_time < $4 AND (sale.collection_name = ANY($6) OR CARDINALITY($6) = 0)
                            ${typeof args.marketplace === 'string' ? 'AND sale.maker_marketplace = $7' : ''}
                        GROUP BY seller
                    ) UNION ALL (
                        SELECT 
                            buyer account, 
                            SUM(final_price) amount, 
                            SUM(final_price) FILTER (WHERE sale.updated_at_time > $5) "bonus"
                        FROM atomicmarket_sales sale 
                        WHERE sale.market_contract = $1 AND sale.settlement_symbol = $2 AND sale.state = ${SaleState.SOLD.valueOf()}
                            AND sale.updated_at_time > $3 AND sale.updated_at_time < $4 AND (sale.collection_name = ANY($6) OR CARDINALITY($6) = 0)
                            ${typeof args.marketplace === 'string' ? 'AND sale.taker_marketplace = $7' : ''}
                        GROUP BY buyer
                    )
                ) x
                GROUP BY x.account
            `;
            const queryValues = [
                core.args.atomicmarket_account, args.symbol,
                args.after, args.before, args.before - args.multiplier_frame,
                args.collection_name ? args.collection_name.split(',') : []
            ];

            if (typeof args.marketplace === 'string') {
                queryValues.push(args.marketplace);
            }

            const query = await server.query(queryString, queryValues);

            res.json({
                success: true,
                data: query.rows
                    .map(row => ({
                        account: row.account,
                        tickets: Math.floor(
                            (parseInt(row.amount, 10) + parseInt(args.multiplier_amount, 10) * row.bonus) /
                            Math.pow(10, symbol.token_precision)
                        )
                    }))
                    .sort((a, b) => b.tickets - a.tickets)
                    .filter(row => row.tickets > 0),
                query_time: Date.now()
            });
        } catch (e) {
            return res.status(500).json({success: false, message: 'Internal Server Error'});
        }
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
                    parameters: [
                        {
                            in: 'query',
                            name: 'symbol',
                            required: false,
                            schema: {type: 'string'},
                            description: 'Token symbol'
                        },
                        ...greylistFilterParameters
                    ],
                    responses: getOpenAPI3Responses([200, 500], {
                        type: 'object',
                        properties: {
                            total: {
                                type: 'object',
                                properties: {
                                    nfts: {type: 'string'}
                                }
                            },
                            today: {
                                type: 'object',
                                properties: {
                                    transactions: {type: 'string'},
                                    sales_count: {type: 'string'},
                                    sales_volume: {type: 'number'},
                                    auctions_count: {type: 'string'},
                                    auctions_volume: {type: 'number'}
                                }
                            }
                        }
                    })
                }
            },
            '/v1/assets/suggestions': {
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
            },
            '/v1/sales/suggestions': {
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
                        },
                        {
                            in: 'query',
                            name: 'sale_id',
                            required: false,
                            schema: {type: 'integer'},
                            description: 'Get suggestions for a sale id'
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
