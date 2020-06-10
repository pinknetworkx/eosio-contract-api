import { atomicassetsComponents } from '../atomicassets/openapi';

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
                        sale_id: {type: 'integer'}
                    }
                }
            },
            auction: {
                type: 'object',
                properties: {
                    market_contract: {type: 'string'},
                    auction_id: {type: 'integer'}
                }
            }
        }
    },
    Asset: atomicassetsComponents.Asset,
    Sale: {
        type: 'object',
        properties: {
            market_contract: {type: 'string'},
            sale_id: {type: 'integer'},
            seller: {type: 'string'},
            asset_contract: {type: 'string'},
            offer_id: {type: 'integer'},

            // TODO
            price: {
                type: 'object',
                properties: {
                    raw: {
                        type: 'object',
                        properties: {
                            amount: {type: 'integer'},
                            token_precision: {type: 'integer'},
                            token_contract: {type: 'string'},
                            token_symbol: {type: 'string'}
                        }
                    }
                }
            },

            assets: {
                type: 'array',
                items: {'$ref': '#/components/schemas/ListingAsset'}
            },

            maker_marketplace: {type: 'string', nullable: true},
            taker_marketplace: {type: 'string', nullable: true},

            collection: atomicassetsComponents.Asset.properties.collection,

            sale_state: {type: 'integer'},
            offer_state: {type: 'integer'},

            updated_at_block: {type: 'integer'},
            updated_at_time: {type: 'integer'},
            created_at_block: {type: 'integer'},
            created_at_time: {type: 'integer'}
        }
    },
    Auction: {
        type: 'object',
        properties: {
            market_contract: {type: 'string'},
            auction_id: {type: 'integer'},
            seller: {type: 'string'},
            asset_contract: {type: 'string'},
            offer_id: {type: 'integer'},

            price: {
                type: 'object',
                properties: {
                    amount: {type: 'integer'},
                    token_precision: {type: 'integer'},
                    token_contract: {type: 'string'},
                    token_symbol: {type: 'string'}
                }
            },

            assets: {
                type: 'array',
                items: {'$ref': '#/components/schemas/ListingAsset'}
            },

            maker_marketplace: {type: 'string', nullable: true},
            taker_marketplace: {type: 'string', nullable: true},

            collection: atomicassetsComponents.Asset.properties.collection,

            auction_state: {type: 'integer'},

            updated_at_block: {type: 'integer'},
            updated_at_time: {type: 'integer'},
            created_at_block: {type: 'integer'},
            created_at_time: {type: 'integer'}
        }
    }
};
