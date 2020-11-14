import { atomicassetsComponents, generateOfferSchema, generateTransferSchema } from '../atomicassets/openapi';

export const atomicmarketComponents = {
    ListingAsset: {
        type: 'object',
        properties: {
            ...atomicassetsComponents.Asset.properties,
            sales: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        market_contract: {type: 'string'},
                        sale_id: {type: 'string'}
                    }
                }
            },
            auction: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        market_contract: {type: 'string'},
                        auction_id: {type: 'string'}
                    }
                }
            }
        }
    },
    ListingOffer: generateOfferSchema('ListingAsset'),
    ListingTransfer: generateTransferSchema('ListingAsset'),
    Asset: atomicassetsComponents.Asset,
    Sale: {
        type: 'object',
        properties: {
            market_contract: {type: 'string'},
            assets_contract: {type: 'string'},
            sale_id: {type: 'string'},

            seller: {type: 'string'},
            buyer: {type: 'string'},

            offer_id: {type: 'string'},

            price: {
                type: 'object',
                properties: {
                    amount: {type: 'string'},
                    token_precision: {type: 'integer'},
                    token_contract: {type: 'string'},
                    token_symbol: {type: 'string'}
                }
            },

            listing_price: {type: 'number'},
            listing_symbol: {type: 'string'},

            assets: {
                type: 'array',
                items: {'$ref': '#/components/schemas/Asset'}
            },

            maker_marketplace: {type: 'string', nullable: true},
            taker_marketplace: {type: 'string', nullable: true},

            collection: atomicassetsComponents.Asset.properties.collection,

            state: {type: 'integer'},

            updated_at_block: {type: 'string'},
            updated_at_time: {type: 'string'},
            created_at_block: {type: 'string'},
            created_at_time: {type: 'string'},
            created_at_txid: {type: 'string'}
        }
    },
    Auction: {
        type: 'object',
        properties: {
            market_contract: {type: 'string'},
            assets_contract: {type: 'string'},
            auction_id: {type: 'string'},

            seller: {type: 'string'},
            buyer: {type: 'string', nullable: true},

            price: {
                type: 'object',
                properties: {
                    amount: {type: 'string'},
                    token_precision: {type: 'integer'},
                    token_contract: {type: 'string'},
                    token_symbol: {type: 'string'}
                }
            },

            assets: {
                type: 'array',
                items: {'$ref': '#/components/schemas/Asset'}
            },

            bids: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        number: {type: 'integer'},
                        account: {type: 'string'},
                        amount: {type: 'string'},
                        created_at_block: {type: 'string'},
                        created_at_time: {type: 'string'},
                        txid: {type: 'string'}
                    }
                }
            },

            maker_marketplace: {type: 'string', nullable: true},
            taker_marketplace: {type: 'string', nullable: true},

            collection: atomicassetsComponents.Asset.properties.collection,

            state: {type: 'integer'},

            end_time: {type: 'string'},

            updated_at_block: {type: 'string'},
            updated_at_time: {type: 'string'},
            created_at_block: {type: 'string'},
            created_at_time: {type: 'string'},
            created_at_txid: {type: 'string'}
        }
    },
    Marketplace: {
        type: 'object',
        properties: {
            marketplace_name: {type: 'string'},
            creator: {type: 'string'},
            created_at_block: {type: 'string'},
            created_at_time: {type: 'string'}
        }
    },
    Collection: atomicassetsComponents.Collection,
    Log: atomicassetsComponents.Log
};

export const listingFilterParameters = [
    {
        name: 'max_assets',
        in: 'query',
        description: 'Max assets per listing',
        required: false,
        schema: {type: 'integer'}
    },
    {
        name: 'min_assets',
        in: 'query',
        description: 'Min assets per listing',
        required: false,
        schema: {type: 'integer'}
    },
    {
        name: 'max_assets',
        in: 'query',
        description: 'Max assets per listing',
        required: false,
        schema: {type: 'integer'}
    },
    {
        name: 'show_seller_contracts',
        in: 'query',
        description: 'If false no seller contracts are shown except if they are in the contract whitelist',
        required: false,
        schema: {type: 'boolean'}
    },
    {
        name: 'contract_whitelist',
        in: 'query',
        description: 'Show these accounts even if they are contracts',
        required: false,
        schema: {type: 'boolean'}
    },
    {
        name: 'seller_blacklist',
        in: 'query',
        description: 'Dont show listings from these sellers (Split multiple with ",")',
        required: false,
        schema: {type: 'boolean'}
    },
    {
        name: 'asset_id',
        in: 'query',
        description: 'Asset id in the offer',
        required: false,
        schema: {type: 'int'}
    },
    {
        name: 'marketplace',
        in: 'query',
        description: 'Filter by all sales where a certain marketplace is either taker or maker marketplace - separate multiple with ","',
        required: false,
        schema: {type: 'string'}
    },
    {
        name: 'maker_marketplace',
        in: 'query',
        description: 'Maker marketplace - separate multiple with ","',
        required: false,
        schema: {type: 'string'}
    },
    {
        name: 'taker_marketplace',
        in: 'query',
        description: 'Taker marketplace - separate multiple with ","',
        required: false,
        schema: {type: 'string'}
    },
    {
        name: 'symbol',
        in: 'query',
        description: 'Filter by symbol',
        required: false,
        schema: {type: 'string'}
    },
    {
        name: 'seller',
        in: 'query',
        description: 'Filter by seller - separate multiple with ","',
        required: false,
        schema: {type: 'string'}
    },
    {
        name: 'buyer',
        in: 'query',
        description: 'Filter by buyer - separate multiple with ","',
        required: false,
        schema: {type: 'string'}
    },
    {
        name: 'min_price',
        in: 'query',
        description: 'Lower price limit',
        required: false,
        schema: {type: 'number'}
    },
    {
        name: 'max_price',
        in: 'query',
        description: 'Upper price limit',
        required: false,
        schema: {type: 'number'}
    },
    {
        name: 'below_suggested_average',
        in: 'query',
        description: 'Only show listings with a price below the suggested average price',
        required: false,
        schema: {type: 'boolean'}
    },
    {
        name: 'below_suggested_median',
        in: 'query',
        description: 'Only show listings with a price below the suggested median price',
        required: false,
        schema: {type: 'boolean'}
    },
    {
        name: 'min_template_mint',
        in: 'query',
        description: 'Min template mint',
        required: false,
        schema: {type: 'number'}
    },
    {
        name: 'max_template_mint',
        in: 'query',
        description: 'Max template mint',
        required: false,
        schema: {type: 'number'}
    },
    {
        name: 'min_schema_mint',
        in: 'query',
        description: 'Min schema mint',
        required: false,
        schema: {type: 'number'}
    },
    {
        name: 'max_schema_mint',
        in: 'query',
        description: 'Max schema mint',
        required: false,
        schema: {type: 'number'}
    },
    {
        name: 'min_collection_mint',
        in: 'query',
        description: 'Min collection mint',
        required: false,
        schema: {type: 'number'}
    },
    {
        name: 'max_collection_mint',
        in: 'query',
        description: 'Max collection mint',
        required: false,
        schema: {type: 'number'}
    }
];
