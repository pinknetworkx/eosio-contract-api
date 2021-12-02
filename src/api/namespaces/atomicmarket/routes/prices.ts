import * as express from 'express';

import { AtomicMarketNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { getOpenAPI3Responses, paginationParameters, primaryBoundaryParameters } from '../../../docs';
import {
    extendedAssetFilterParameters,
    baseAssetFilterParameters,
    greylistFilterParameters,
    hideOffersParameters
} from '../../atomicassets/openapi';
import {
    getAssetSalesAction,
    getPricesAction, getPricesAssetsAction,
    getPricesSalesDaysAction,
    getPricesTemplatesAction
} from '../handlers/prices';

export function pricesEndpoints(core: AtomicMarketNamespace, server: HTTPServer, router: express.Router): any {
    const {caching, returnAsJSON} = server.web;

    router.all(['/v1/prices/sales', '/v1/prices'], caching(), returnAsJSON(getPricesAction, core));

    router.all('/v1/assets/:asset_id/sales', caching(), returnAsJSON(getAssetSalesAction, core));

    router.all('/v1/prices/sales/days', caching(), returnAsJSON(getPricesSalesDaysAction, core));

    router.all('/v1/prices/templates', caching(), returnAsJSON(getPricesTemplatesAction, core));

    router.all('/v1/prices/assets', caching(), returnAsJSON(getPricesAssetsAction, core));

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
