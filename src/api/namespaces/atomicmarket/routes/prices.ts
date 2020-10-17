import * as express from 'express';

import { AtomicMarketNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { getOpenAPI3Responses, paginationParameters, primaryBoundaryParameters } from '../../../docs';
import { SaleState } from '../../../../filler/handlers/atomicmarket';
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
                template_id: {type: 'int', min: 1},
                schema_name: {type: 'string', min: 1},
                symbol: {type: 'string', min: 1},
                state: {type: 'int', min: 0, default: SaleState.SOLD.valueOf()}
            });

            let queryString = 'SELECT ' +
                'sale.sale_id, sale.final_price price, mint.min_template_mint template_mint, ' +
                'symbol.token_symbol, symbol.token_precision, ' +
                'symbol.token_contract, sale.updated_at_time block_time, sale.updated_at_block block_num ' +
                'FROM ' +
                    'atomicmarket_sales sale LEFT JOIN atomicmarket_sale_mints mint ON (sale.market_contract = mint.market_contract AND sale.sale_id = mint.sale_id), ' +
                    'atomicmarket_tokens symbol ' +
                'WHERE sale.market_contract = $1 AND sale.state = $2 AND ' +
                'sale.market_contract = symbol.market_contract AND sale.settlement_symbol = symbol.token_symbol ';
            const queryValues = [core.args.atomicmarket_account, args.state];
            let varCounter = queryValues.length;

            if (args.collection_name && args.schema_name && !args.template_id) {
                queryString += 'AND NOT EXISTS (' +
                    'SELECT * FROM atomicassets_offers_assets asset_o, atomicassets_assets asset_a ' +
                    'WHERE asset_a.contract = asset_o.contract AND asset_a.asset_id = asset_o.asset_id AND asset_o.offer_id = sale.offer_id AND ' +
                    '(asset_a.collection_name != $' + ++varCounter + ' OR asset_a.schema_name != $' + ++varCounter + ') ' +
                    ') ';

                queryValues.push(args.collection_name, args.schema_name);
            }

            if (args.collection_name && args.template_id) {
                queryString += 'AND NOT EXISTS (' +
                    'SELECT * FROM atomicassets_offers_assets asset_o, atomicassets_assets asset_a ' +
                    'WHERE asset_a.contract = asset_o.contract AND asset_a.asset_id = asset_o.asset_id AND asset_o.offer_id = sale.offer_id AND ' +
                    '(asset_a.collection_name != $' + ++varCounter + ' OR asset_a.template_id != $' + ++varCounter + ' OR asset_a.template_id IS NULL) ' +
                    ') ';

                queryValues.push(args.collection_name, args.template_id);
            }

            if (args.symbol) {
                queryString += 'AND sale.settlement_symbol = $' + ++varCounter + ' ';
                queryValues.push(args.symbol);
            }

            queryString += 'ORDER BY updated_at_block DESC LIMIT 500';

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
                    'price."median", price."average", price."min", price."max", price.sales ' +
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
                    'SUM(price."median") "median", SUM(price."average") "average", SUM(price."min") "min", SUM(price."max") "max" ' +
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
            varCounter += queryValues.length;
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
                        },
                        {
                            name: 'state',
                            in: 'query',
                            description: ' 1: Listed; 3: Sold',
                            required: false,
                            schema: {type: 'integer', default: 3}
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
                                block_time: {type: 'string'},
                                block_num: {type: 'string'}
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
