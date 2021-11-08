import * as express from 'express';

import { AtomicMarketNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { getOpenAPI3Responses, paginationParameters, primaryBoundaryParameters } from '../../../docs';
import { buildBoundaryFilter, filterQueryArgs } from '../../utils';
import { buildAssetQueryCondition } from '../../atomicassets/routes/assets';
import {
    extendedAssetFilterParameters,
    baseAssetFilterParameters,
    greylistFilterParameters,
    hideOffersParameters
} from '../../atomicassets/openapi';
import QueryBuilder from '../../../builder';
import { respondApiError } from '../../../utils';

export function pricesEndpoints(core: AtomicMarketNamespace, server: HTTPServer, router: express.Router): any {
    router.all(['/v1/prices/sales', '/v1/prices'], server.web.caching(), async (req, res) => {
        try {
            const args = filterQueryArgs(req, {
                collection_name: {type: 'string', min: 1},
                template_id: {type: 'string', min: 1},
                schema_name: {type: 'string', min: 1},
                asset_id: {type: 'string', min: 1},
                symbol: {type: 'string', min: 1}
            });

            const query = new QueryBuilder(
                'SELECT price.*, token.token_precision, token.token_contract, asset.template_mint ' +
                'FROM atomicmarket_stats_prices price, atomicassets_assets asset, atomicmarket_tokens token '
            );

            query.equal('price.market_contract', core.args.atomicmarket_account);
            query.addCondition(
                'price.assets_contract = asset.contract AND price.asset_id = asset.asset_id AND ' +
                'price.market_contract = token.market_contract AND price.symbol = token.token_symbol'
            );

            if (args.collection_name) {
                query.equalMany('price.collection_name', args.collection_name.split(','));
            }

            if (args.schema_name) {
                query.equalMany('price.schema_name', args.schema_name.split(','));
            }

            if (args.template_id && args.template_id.toLowerCase() !== 'null') {
                query.equalMany('price.template_id', args.template_id.split(','));
            }

            if (args.template_id && args.template_id.toLowerCase() === 'null') {
                query.isNull('price.template_id');
            }

            if (args.asset_id) {
                query.equalMany('price.asset_id', args.asset_id.split(','));
            }

            if (args.symbol) {
                query.equalMany('price.symbol', args.symbol.split(','));
            }

            query.append('ORDER BY price."time" DESC LIMIT 500');

            const result = await server.query(query.buildString(), query.buildValues());

            res.json({
                success: true,
                data: result.rows.map(row => ({
                    sale_id: row.listing_type === 'sale' ? row.listing_id : null,
                    auction_id: row.listing_type === 'auction' ? row.listing_id : null,
                    buyoffer_id: row.listing_type === 'buyoffer' ? row.listing_id : null,
                    price: row.price,
                    template_mint: row.template_mint,
                    token_symbol: row.symbol,
                    token_precision: row.token_precision,
                    token_contract: row.token_contract,
                    block_time: row.time,
                })).reverse(),
                query_time: Date.now()
            });
        } catch (error) {
            return respondApiError(res, error);
        }
    });

    router.all(['/v1/assets/:asset_id/sales'], server.web.caching(), async (req, res) => {
        try {
            const args = filterQueryArgs(req, {
                seller: {type: 'string', min: 1},
                buyer: {type: 'string', min: 1},
                symbol: {type: 'string', min: 1},
                limit: {type: 'int', min: 1, default: 100},
                order: {type: 'string', values: ['asc', 'desc'], default: 'desc'},
                bundles: {type: 'bool'}
            });

            const query = new QueryBuilder(`
                SELECT * FROM (
                    (
                        SELECT 
                            listing.market_contract, listing.sale_id, (NULL)::bigint auction_id, (NULL)::bigint buyoffer_id,
                            listing.settlement_symbol token_symbol, "token".token_precision, "token".token_contract,
                            listing.final_price price, listing.seller, listing.buyer, listing.updated_at_time block_time
                        FROM atomicmarket_sales listing, atomicassets_offers offer, atomicassets_offers_assets asset, atomicmarket_tokens "token"
                        WHERE listing.assets_contract = offer.contract AND listing.offer_id = offer.offer_id
                            AND offer.contract = asset.contract AND offer.offer_id = asset.offer_id
                            AND listing.market_contract = "token".market_contract AND listing.settlement_symbol = "token".token_symbol
                            AND listing."state" = 3 AND asset.asset_id = $1
                    ) UNION ALL (
                        SELECT 
                            listing.market_contract, (NULL)::bigint sale_id, listing.auction_id, (NULL)::bigint buyoffer_id,
                            listing.token_symbol, "token".token_precision, "token".token_contract,
                            listing.price, listing.seller, listing.buyer, listing.end_time * 1000 block_time
                        FROM atomicmarket_auctions listing, atomicmarket_auctions_assets asset, atomicmarket_tokens "token"
                        WHERE listing.market_contract = asset.market_contract AND listing.auction_id = asset.auction_id
                            AND listing.market_contract = "token".market_contract AND listing.token_symbol = "token".token_symbol
                            AND listing."state" = 1 AND listing.end_time <= extract(epoch from now())::bigint * 1000 AND asset.asset_id = $1
                    ) UNION ALL (
                        SELECT 
                            listing.market_contract, (NULL)::bigint sale_id, (NULL)::bigint auction_id, listing.buyoffer_id,
                            listing.token_symbol, "token".token_precision, "token".token_contract,
                            listing.price, listing.seller, listing.buyer, listing.updated_at_time block_time
                        FROM atomicmarket_buyoffers listing, atomicmarket_buyoffers_assets asset, atomicmarket_tokens "token"
                        WHERE listing.market_contract = asset.market_contract AND listing.buyoffer_id = asset.buyoffer_id
                            AND listing.market_contract = "token".market_contract AND listing.token_symbol = "token".token_symbol
                            AND listing."state" = 3 AND asset.asset_id = $1
                    )
                ) t1
            `, [req.params.asset_id]);

            query.equal('t1.market_contract', core.args.atomicmarket_account);

            if (args.symbol) {
                query.equalMany('t1.token_symbol', args.symbol.split(','));
            }

            if (args.seller) {
                query.equalMany('t1.seller', args.seller.split(','));
            }

            if (args.buyer) {
                query.equalMany('t1.buyer', args.buyer.split(','));
            }

            query.append(`ORDER BY t1.block_time ${args.order === 'asc' ? 'ASC' : 'DESC'} LIMIT 500`);

            const result = await server.query(query.buildString(), query.buildValues());

            res.json({
                success: true,
                data: result.rows,
                query_time: Date.now()
            });
        } catch (error) {
            return respondApiError(res, error);
        }
    });

    router.all(['/v1/prices/sales/days'], server.web.caching(), async (req, res) => {
        try {
            const args = filterQueryArgs(req, {
                collection_name: {type: 'string', min: 1},
                template_id: {type: 'string', min: 1},
                schema_name: {type: 'string', min: 1},
                asset_id: {type: 'string', min: 1},
                symbol: {type: 'string', min: 1}
            });

            const query = new QueryBuilder(`
                SELECT 
                    (PERCENTILE_DISC(0.5) WITHIN GROUP (ORDER BY price.price))::bigint median, 
                    AVG(price.price)::bigint average,
                    COUNT(*) sales, token.token_symbol, token.token_precision, token.token_contract,
                    (price.time / (3600 * 24 * 1000)) daytime
                FROM atomicmarket_stats_prices price, atomicmarket_tokens token 
            `);

            query.equal('price.market_contract', core.args.atomicmarket_account);
            query.addCondition('price.market_contract = token.market_contract AND price.symbol = token.token_symbol');

            if (args.collection_name) {
                query.equalMany('price.collection_name', args.collection_name.split(','));
            }

            if (args.schema_name) {
                query.equalMany('price.schema_name', args.schema_name.split(','));
            }

            if (args.template_id && args.template_id.toLowerCase() !== 'null') {
                query.equalMany('price.template_id', args.template_id.split(','));
            }

            if (args.template_id && args.template_id.toLowerCase() === 'null') {
                query.isNull('price.template_id');
            }

            if (args.asset_id) {
                query.equalMany('price.asset_id', args.asset_id.split(','));
            }

            if (args.symbol) {
                query.equalMany('price.symbol', args.symbol.split(','));
            }

            query.group(['token.market_contract', 'token.token_symbol', 'daytime']);
            query.append('ORDER BY daytime ASC');

            const prices = await server.query(query.buildString(), query.buildValues());

            res.json({
                success: true,
                data: prices.rows.map(row => ({
                    median: row.median,
                    average: row.average,
                    sales: row.sales,
                    token_symbol: row.token_symbol,
                    token_precision: row.token_precision,
                    token_contract: row.token_contract,
                    time: row.daytime * 3600 * 24 * 1000 + 3600 * 12 * 1000,
                })).reverse(),
                query_time: Date.now()
            });
        } catch (error) {
            return respondApiError(res, error);
        }
    });

    router.all('/v1/prices/templates', server.web.caching(), async (req, res) => {
        try {
            const args = filterQueryArgs(req, {
                collection_name: {type: 'string', min: 1},
                template_id: {type: 'string', min: 1},
                schema_name: {type: 'string', min: 1},
                symbol: {type: 'string', min: 1},

                page: {type: 'int', min: 1, default: 1},
                limit: {type: 'int', min: 1, max: 1000, default: 100},
            });

            const query = new QueryBuilder(
                'SELECT price.market_contract, price.assets_contract, ' +
                'price.collection_name, price.template_id, ' +
                'token.token_symbol, token.token_contract, token.token_precision, ' +
                'price."median", price."average", price."min", price."max", price.sales, ' +
                'price.suggested_median, price.suggested_average ' +
                'FROM atomicassets_templates "template", atomicmarket_template_prices "price", atomicmarket_tokens "token" '
            );

            query.equal('"price".market_contract', core.args.atomicmarket_account);
            query.equal('"price".assets_contract', core.args.atomicassets_account);
            query.addCondition(
                '"template".contract = "price".assets_contract AND "template".collection_name = "price".collection_name AND "template".template_id = "price".template_id AND ' +
                '"price".market_contract = "token".market_contract AND "price".symbol = "token".token_symbol'
            );

            if (args.collection_name) {
                query.equalMany('price.collection_name', args.collection_name.split(','));
            }

            if (args.schema_name) {
                query.equalMany('"template".schema_name', args.schema_name.split(','));
            }

            if (args.template_id) {
                query.equalMany('price.template_id', args.template_id.split(','));
            }

            if (args.symbol) {
                query.equalMany('price.symbol', args.symbol.split(','));
            }

            query.append('ORDER BY "price".template_id ASC, "price".symbol ASC');
            query.append('LIMIT ' + query.addVariable(args.limit) + ' OFFSET ' + query.addVariable((args.page - 1) * args.limit) + ' ');

            const result = await server.query(query.buildString(), query.buildValues());

            res.json({
                success: true,
                data: result.rows,
                query_time: Date.now()
            });
        } catch (error) {
            return respondApiError(res, error);
        }
    });

    router.all('/v1/prices/assets', server.web.caching(), async (req, res) => {
        try {
            const query = new QueryBuilder(
                'SELECT token.token_symbol, token.token_precision, token.token_contract, ' +
                'SUM(price."median") "median", SUM(price."average") "average", SUM(price."min") "min", SUM(price."max") "max", ' +
                'SUM(price.suggested_median) suggested_median, SUM(price.suggested_average) suggested_average ' +
                'FROM atomicassets_assets asset, atomicassets_templates "template", atomicmarket_template_prices "price", atomicmarket_tokens token'
            );

            query.equal('price.assets_contract', core.args.atomicassets_account);
            query.equal('price.market_contract', core.args.atomicmarket_account);
            query.addCondition(
                'asset.contract = template.contract AND asset.template_id = template.template_id AND ' +
                'template.contract = price.assets_contract AND template.template_id = price.template_id AND ' +
                'token.market_contract = price.market_contract AND token.token_symbol = price.symbol'
            );

            buildAssetQueryCondition(req, query, {assetTable: '"asset"', templateTable: '"template"'});
            buildBoundaryFilter(req, query, 'asset.asset_id', 'int', null);

            query.append('GROUP BY token.token_symbol, token.token_precision, token.token_contract');

            const result = await server.query(query.buildString(), query.buildValues());

            res.json({
                success: true,
                data: result.rows,
                query_time: Date.now()
            });
        } catch (error) {
            return respondApiError(res, error);
        }
    });

    return {
        tag: {
            name: 'pricing',
            description: 'Pricing'
        },
        paths: {
            '/v1/assets/{asset_id}/sales': {
                get: {
                    tags: ['assets'],
                    summary: 'Gets price history for a specific asset',
                    parameters: [
                        {
                            in: 'path',
                            name: 'asset_id',
                            description: 'Asset Id',
                            required: true,
                            schema: {type: 'integer'}
                        },
                        {
                            name: 'buyer',
                            in: 'query',
                            description: 'Buyer',
                            required: false,
                            schema: {type: 'string'}
                        },
                        {
                            name: 'seller',
                            in: 'query',
                            description: 'Seller',
                            required: false,
                            schema: {type: 'string'}
                        },
                        {
                            name: 'symbol',
                            in: 'query',
                            description: 'Token symbol',
                            required: false,
                            schema: {type: 'string'}
                        },
                        {
                            name: 'order',
                            in: 'query',
                            description: 'Order by time',
                            required: false,
                            schema: {type: 'string', enum: ['asc', 'desc'], default: 'asc'}
                        }
                    ],
                    responses: getOpenAPI3Responses([500, 200], {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                sale_id: {type: 'string'},
                                auction_id: {type: 'string'},
                                buyoffer_id: {type: 'string'},
                                price: {type: 'string'},
                                token_symbol: {type: 'string'},
                                token_precision: {type: 'integer'},
                                token_contract: {type: 'string'},
                                seller: {type: 'string'},
                                buyer: {type: 'string'},
                                block_time: {type: 'string'}
                            }
                        }
                    })
                }
            },
            '/v1/prices/sales': {
                get: {
                    tags: ['pricing'],
                    summary: 'Gets price history for a template or schema',
                    parameters: [
                        ...baseAssetFilterParameters,
                        {
                            name: 'symbol',
                            in: 'query',
                            description: 'Token symbol',
                            required: false,
                            schema: {type: 'string'}
                        }
                    ],
                    responses: getOpenAPI3Responses([500, 200], {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                sale_id: {type: 'string'},
                                auction_id: {type: 'string'},
                                buyoffer_id: {type: 'string'},
                                template_mint: {type: 'string'},
                                price: {type: 'string'},
                                token_symbol: {type: 'string'},
                                token_precision: {type: 'integer'},
                                token_contract: {type: 'string'},
                                block_time: {type: 'string'}
                            }
                        }
                    })
                }
            },
            '/v1/prices/sales/days': {
                get: {
                    tags: ['pricing'],
                    summary: 'Gets price history for a template or schema',
                    parameters: [
                        ...baseAssetFilterParameters,
                        {
                            name: 'symbol',
                            in: 'query',
                            description: 'Token symbol',
                            required: false,
                            schema: {type: 'string'}
                        }
                    ],
                    responses: getOpenAPI3Responses([500, 200], {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                average: {type: 'string'},
                                median: {type: 'string'},
                                token_symbol: {type: 'string'},
                                token_precision: {type: 'integer'},
                                token_contract: {type: 'string'},
                                time: {type: 'string'}
                            }
                        }
                    })
                }
            },
            '/v1/prices/templates': {
                get: {
                    tags: ['pricing'],
                    summary: 'Get template price stats',
                    parameters: [
                        ...baseAssetFilterParameters,
                        {
                            name: 'symbol',
                            in: 'query',
                            description: 'Token symbol',
                            required: false,
                            schema: {type: 'string'}
                        },
                        ...paginationParameters
                    ],
                    responses: getOpenAPI3Responses([500, 200], {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                token_symbol: {type: 'string'},
                                token_precision: {type: 'integer'},
                                token_contract: {type: 'string'},

                                collection_name: {type: 'string'},
                                template_id: {type: 'string'},

                                average: {type: 'string'},
                                median: {type: 'string'},
                                suggested_average: {type: 'string'},
                                suggested_median: {type: 'string'},
                                min: {type: 'string'},
                                max: {type: 'string'}
                            }
                        }
                    })
                }
            },
            '/v1/prices/assets': {
                get: {
                    tags: ['pricing'],
                    summary: 'Gets price history for a template or schema',
                    parameters: [
                        ...baseAssetFilterParameters,
                        ...extendedAssetFilterParameters,
                        {
                            name: 'authorized_account',
                            in: 'query',
                            description: 'Filter for assets the provided account can edit. ',
                            required: false,
                            schema: {
                                type: 'string'
                            }
                        },
                        ...hideOffersParameters,
                        ...greylistFilterParameters,
                        ...primaryBoundaryParameters
                    ],
                    responses: getOpenAPI3Responses([500, 200], {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                token_symbol: {type: 'string'},
                                token_precision: {type: 'integer'},
                                token_contract: {type: 'string'},
                                median: {type: 'string'},
                                average: {type: 'string'},
                                suggested_average: {type: 'string'},
                                suggested_median: {type: 'string'},
                                min: {type: 'string'},
                                max: {type: 'string'}
                            }
                        }
                    })
                }
            }
        }
    };
}
