import * as express from 'express';

import { AtomicMarketNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { getOpenAPI3Responses } from '../../../docs';
import { SaleState } from '../../../../filler/handlers/atomicmarket';
import { filterQueryArgs } from '../../utils';

export function pricesEndpoints(core: AtomicMarketNamespace, server: HTTPServer, router: express.Router): any {
    router.get('/v1/prices', server.web.caching(), async (req, res) => {
        try {
            const args = filterQueryArgs(req, {
                collection_name: {type: 'string', min: 1},
                template_id: {type: 'int', min: 1},
                schema_name: {type: 'string', min: 1},
                symbol: {type: 'string', min: 1}
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
            const queryValues = [core.args.atomicmarket_account, SaleState.SOLD.valueOf()];
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

    return {
        tag: {
            name: 'pricing',
            description: 'Pricing'
        },
        paths: {
            '/v1/prices': {
                get: {
                    tags: ['pricing'],
                    summary: 'Gets price history for a template or schema',
                    parameters: [
                        {
                            name: 'collection_name',
                            in: 'query',
                            description: 'Collection Name',
                            required: false,
                            schema: {type: 'string'}
                        },
                        {
                            name: 'template_id',
                            in: 'query',
                            description: 'Template id',
                            required: false,
                            schema: {type: 'integer'}
                        },
                        {
                            name: 'schema_name',
                            in: 'query',
                            description: 'Schema Name',
                            required: false,
                            schema: {type: 'string'}
                        },
                        {
                            name: 'symbol',
                            in: 'query',
                            description: 'Token symbol',
                            required: false,
                            schema: {type: 'string'}
                        }
                    ],
                    responses: getOpenAPI3Responses([500, 200], {
                        type: 'object',
                        properties: {
                            sale_id: {type: 'integer'},
                            template_mint: {type: 'integer'},
                            price: {type: 'integer'},
                            token_symbol: {type: 'string'},
                            token_precision: {type: 'integer'},
                            token_contract: {type: 'string'},
                            block_time: {type: 'integer'},
                            block_num: {type: 'integer'}
                        }
                    })
                }
            }
        }
    };
}
