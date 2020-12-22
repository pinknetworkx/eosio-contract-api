import * as express from 'express';

import { AtomicMarketNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { getOpenAPI3Responses, paginationParameters, primaryBoundaryParameters } from '../../../docs';
import { buildBoundaryFilter, filterQueryArgs } from '../../utils';
import { buildAssetQueryCondition } from '../../atomicassets/routes/assets';
import {
    assetFilterParameters,
    baseAssetFilterParameters,
    greylistFilterParameters,
    hideOffersParameters
} from '../../atomicassets/openapi';

export function pricesEndpoints(core: AtomicMarketNamespace, server: HTTPServer, router: express.Router): any {
    router.all(['/v1/prices/sales', '/v1/prices'], server.web.caching(), async (req, res) => {
        try {
            const args = filterQueryArgs(req, {
                collection_name: {type: 'string', min: 1},
                template_id: {type: 'string', min: 1},
                schema_name: {type: 'string', min: 1},
                symbol: {type: 'string', min: 1}
            });

            let subQueryString = 'AND listing.market_contract = $1 ';
            const queryValues = [core.args.atomicmarket_account];
            let varCounter = queryValues.length;

            if (args.collection_name) {
                subQueryString += 'AND asset.collection_name = ANY ($' + ++varCounter + ') ';
                queryValues.push(args.collection_name.split(','));
            }

            if (args.schema_name) {
                subQueryString += 'AND asset.schema_name = ANY ($' + ++varCounter + ') ';
                queryValues.push(args.schema_name.split(','));
            }

            if (args.template_id) {
                subQueryString += 'AND asset.template_id = ANY ($' + ++varCounter + ') ';
                queryValues.push(args.template_id.split(','));
            }

            if (args.symbol) {
                subQueryString += 'AND symbol.token_symbol = ANY ($' + ++varCounter + ') ';
                queryValues.push(args.symbol.split(','));
            }

            const queryString = `
            SELECT * FROM (
                (
                    SELECT
                        listing.market_contract, asset.contract assets_contract, NULL auction_id, listing.sale_id,
                        listing.collection_name, asset.schema_name "schema_name", asset.template_id template_id,
                        mint.min_template_mint template_mint,
                        symbol.token_symbol token_symbol, symbol.token_precision token_precision, symbol.token_contract token_contract, 
                        listing.final_price price, listing.updated_at_time block_time
                    FROM
                        atomicassets_assets asset, atomicassets_offers_assets offer_asset, atomicmarket_sales listing, 
                        atomicmarket_sale_mints mint, atomicmarket_tokens symbol
                    WHERE
                        listing.assets_contract = offer_asset.contract AND listing.offer_id = offer_asset.offer_id AND
                        listing.market_contract = mint.market_contract AND listing.sale_id = mint.sale_id AND
                        listing.market_contract = symbol.market_contract AND listing.settlement_symbol = symbol.token_symbol AND
                        offer_asset.contract = asset.contract AND offer_asset.asset_id = asset.asset_id AND
                        asset.template_id IS NOT NULL AND listing.final_price IS NOT NULL AND listing.state = 3 AND
                        NOT EXISTS(
                            SELECT * FROM atomicassets_offers_assets inner_asset 
                            WHERE inner_asset.contract = offer_asset.contract AND inner_asset.offer_id = offer_asset.offer_id AND 
                            inner_asset.asset_id != offer_asset.asset_id
                        ) ${subQueryString}
                ) UNION ALL (
                    SELECT
                        listing.market_contract, asset.contract assets_contract,  listing.auction_id, NULL sale_id,
                        listing.collection_name, asset.schema_name "schema_name", asset.template_id template_id,
                        mint.min_template_mint template_mint,
                        symbol.token_symbol token_symbol, symbol.token_precision token_precision, symbol.token_contract token_contract, 
                        listing.price, (listing.end_time * 1000) block_time
                    FROM
                        atomicassets_assets asset, atomicmarket_auctions_assets auction_asset, atomicmarket_auctions listing, 
                        atomicmarket_auction_mints mint, atomicmarket_tokens symbol
                    WHERE
                        listing.assets_contract = auction_asset.assets_contract AND listing.auction_id = auction_asset.auction_id AND
                        mint.market_contract = listing.market_contract AND mint.auction_id = listing.auction_id AND
                        listing.market_contract = symbol.market_contract AND listing.token_symbol = symbol.token_symbol AND
                        listing.assets_contract = asset.contract AND auction_asset.asset_id = asset.asset_id AND
                        asset.template_id IS NOT NULL AND listing.buyer IS NOT NULL AND listing.state = 1 AND listing.end_time < extract(epoch from now()) AND
                        NOT EXISTS(
                            SELECT * FROM atomicmarket_auctions_assets inner_asset 
                            WHERE inner_asset.market_contract = auction_asset.market_contract AND inner_asset.auction_id = auction_asset.auction_id AND 
                            inner_asset.asset_id != auction_asset.asset_id
                        ) ${subQueryString}
                )
            ) t1
            ORDER BY t1.block_time DESC LIMIT 500
            `;

            const prices = await server.query(queryString, queryValues);

            res.json({
                success: true,
                data: prices.rows,
                query_time: Date.now()
            });
        } catch (e) {
            res.status(500).json({success: false, message: 'Internal Server Error'});
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

            let queryString = 'SELECT price.market_contract, price.assets_contract, ' +
                    'price.collection_name, price.template_id, ' +
                    'token.token_symbol, token.token_contract, token.token_precision, ' +
                    'price."median", price."average", price."min", price."max", price.sales, ' +
                    'price.suggested_median, price.suggested_average ' +
                'FROM atomicassets_templates "template", atomicmarket_template_prices "price", atomicmarket_tokens "token" ' +
                'WHERE "template".contract = "price".assets_contract AND "template".collection_name = "price".collection_name AND "template".template_id = "price".template_id AND ' +
                    '"price".market_contract = "token".market_contract AND "price".symbol = "token".token_symbol AND ' +
                    '"price".market_contract = $1 AND "price".assets_contract = $2 ';
            const queryValues: any[] = [core.args.atomicmarket_account, core.args.atomicassets_account];
            let varCounter = queryValues.length;

            if (args.collection_name) {
                queryString += 'AND "price".collection_name = ANY ($' + ++varCounter + ') ';
                queryValues.push(args.collection_name.split(','));
            }

            if (args.template_id) {
                queryString += 'AND "price".template_id = ANY ($' + ++varCounter + ') ';
                queryValues.push(args.template_id.split(','));
            }

            if (args.schema_name) {
                queryString += 'AND "template".schema_name = ANY ($' + ++varCounter + ') ';
                queryValues.push(args.schema_name.split(','));
            }

            if (args.symbol) {
                queryString += 'AND "price".symbol = ANY ($' + ++varCounter + ') ';
                queryValues.push(args.symbol.split(','));
            }

            queryString += 'ORDER BY "price".template_id ASC, "price".symbol ASC ';
            queryString += 'LIMIT $' + ++varCounter + ' OFFSET $' + ++varCounter + ' ';
            queryValues.push(args.limit);
            queryValues.push((args.page - 1) * args.limit);

            const prices = await server.query(queryString, queryValues);

            res.json({
                success: true,
                data: prices.rows,
                query_time: Date.now()
            });
        } catch (e) {
            res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    });

    router.all('/v1/prices/assets', server.web.caching(), async (req, res) => {
        try {
            let queryString = 'SELECT token.token_symbol, token.token_precision, token.token_contract, ' +
                    'SUM(price."median") "median", SUM(price."average") "average", SUM(price."min") "min", SUM(price."max") "max", ' +
                    'SUM(price.suggested_median) suggested_median, SUM(price.suggested_average) suggested_average ' +
                'FROM atomicassets_assets asset, atomicassets_templates "template", atomicmarket_template_prices "price", atomicmarket_tokens token ' +
                'WHERE asset.contract = template.contract AND asset.template_id = template.template_id AND ' +
                    'template.contract = price.assets_contract AND template.template_id = price.template_id AND ' +
                    'token.market_contract = price.market_contract AND token.token_symbol = price.symbol AND ' +
                    'price.assets_contract = $1 AND price.market_contract = $2 ';
            let queryValues: any[] = [core.args.atomicassets_account, core.args.atomicmarket_account];
            let varCounter = queryValues.length;

            const assetFilter = buildAssetQueryCondition(req, varCounter, {
                assetTable: '"asset"', templateTable: '"template"'
            });

            queryString += assetFilter.str;
            varCounter += assetFilter.values.length;
            queryValues = queryValues.concat(assetFilter.values);

            const boundaryFilter = buildBoundaryFilter(
                req, varCounter,
                'asset.asset_id', 'int',
                null, null
            );

            queryValues = queryValues.concat(boundaryFilter.values);
            queryString += boundaryFilter.str;

            queryString += 'GROUP BY token.token_symbol, token.token_precision, token.token_contract';

            const prices = await server.query(queryString, queryValues);

            res.json({
                success: true,
                data: prices.rows,
                query_time: Date.now()
            });
        } catch (e) {
            res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    });

    return {
        tag: {
            name: 'pricing',
            description: 'Pricing'
        },
        paths: {
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
            '/v1/prices/templates': {
                get: {
                    tags: ['pricing'],
                    summary: 'Get template price stats',
                    parameters: [
                        baseAssetFilterParameters,
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
                        ...assetFilterParameters,
                        {
                            name: 'only_duplicate_templates',
                            in: 'query',
                            description: 'Show only duplicate assets grouped by template',
                            required: false,
                            schema: {
                                type: 'boolean'
                            }
                        },
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
