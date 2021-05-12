import { LogSchema } from '../../docs';

export function generateOfferSchema(assetSchema: string): any {
    return {
        type: 'object',
        properties: {
            contract: {type: 'string'},
            offer_id: {type: 'string'},
            sender_name: {type: 'string'},
            recipient_name: {type: 'string'},
            memo: {type: 'string'},
            state: {type: 'integer'},

            is_sender_contract: {type: 'boolean'},
            is_recipient_contract: {type: 'boolean'},
            sender_assets: {type: 'array', items: {'$ref': '#/components/schemas/' + assetSchema}},
            recipient_assets: {type: 'array', items: {'$ref': '#/components/schemas/' + assetSchema}},

            updated_at_block: {type: 'string'},
            updated_at_time: {type: 'string'},
            created_at_block: {type: 'string'},
            created_at_time: {type: 'string'}
        }
    };
}

export function generateTransferSchema(assetSchema: string): any {
    return {
        type: 'object',
        properties: {
            contract: {type: 'string'},
            transfer_id: {type: 'string'},
            sender_name: {type: 'string'},
            recipient_name: {type: 'string'},
            memo: {type: 'string'},

            assets: {type: 'array', items: {'$ref': '#/components/schemas/' + assetSchema}},

            created_at_block: {type: 'string'},
            created_at_time: {type: 'string'}
        }
    };
}

export const atomicassetsComponents = {
    'Asset': {
        type: 'object',
        properties: {
            contract: {type: 'string'},
            asset_id: {type: 'string'},
            owner: {type: 'string'},
            name: {type: 'string'},
            is_transferable: {type: 'boolean'},
            is_burnable: {type: 'boolean'},
            template_mint: {type: 'string'},
            collection: {
                type: 'object',
                properties: {
                    collection_name: {type: 'string'},
                    name: {type: 'string'},
                    author: {type: 'string'},
                    allow_notify: {type: 'boolean'},
                    authorized_accounts: {type: 'array', items: {type: 'string'}},
                    notify_accounts: {type: 'array', items: {type: 'string'}},
                    market_fee: {type: 'number'},
                    created_at_block: {type: 'string'},
                    created_at_time: {type: 'string'}
                }
            },
            schema: {
                type: 'object',
                properties: {
                    schema_name: {type: 'string'},
                    format: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                name: {type: 'string'},
                                type: {type: 'string'}
                            }
                        }
                    },
                    created_at_block: {type: 'string'},
                    created_at_time: {type: 'string'}
                }
            },
            template: {
                type: 'object',
                properties: {
                    template_id: {type: 'string'},
                    max_supply: {type: 'string'},
                    issued_supply: {type: 'string'},
                    is_transferable: {type: 'boolean'},
                    is_burnable: {type: 'boolean'},

                    immutable_data: {type: 'object'},

                    created_at_time: {type: 'string'},
                    created_at_block: {type: 'string'}
                }
            },

            backed_tokens: {
                type: 'array', items: {
                    type: 'object',
                    properties: {
                        token_contract: {type: 'string'},
                        token_symbol: {type: 'string'},
                        token_precision: {type: 'integer'},
                        amount: {type: 'string'}
                    }
                }
            },

            immutable_data: {type: 'object'},
            mutable_data: {type: 'object'},
            data: {type: 'object'},

            burned_by_account: {type: 'string'},
            burned_at_block: {type: 'string'},
            burned_at_time: {type: 'string'},
            updated_at_block: {type: 'string'},
            updated_at_time: {type: 'string'},
            transferred_at_block: {type: 'string'},
            transferred_at_time: {type: 'string'},
            minted_at_block: {type: 'string'},
            minted_at_time: {type: 'string'}
        }
    },
    'Collection': {
        type: 'object',
        properties: {
            contract: {type: 'string'},
            collection_name: {type: 'string'},
            name: {type: 'string'},
            author: {type: 'string'},
            allow_notify: {type: 'boolean'},
            authorized_accounts: {type: 'array', items: {type: 'string'}},
            notify_accounts: {type: 'array', items: {type: 'string'}},
            market_fee: {type: 'number'},

            data: {type: 'object'},

            created_at_block: {type: 'string'},
            created_at_time: {type: 'string'}
        }
    },
    'Schema': {
        type: 'object',
        properties: {
            contract: {type: 'string'},
            schema_name: {type: 'string'},
            format: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        name: {type: 'string'},
                        type: {type: 'string'}
                    }
                }
            },
            created_at_block: {type: 'string'},
            created_at_time: {type: 'string'},
            collection: {
                type: 'object',
                properties: {
                    collection_name: {type: 'string'},
                    name: {type: 'string'},
                    author: {type: 'string'},
                    allow_notify: {type: 'boolean'},
                    authorized_accounts: {type: 'array', items: {type: 'string'}},
                    notify_accounts: {type: 'array', items: {type: 'string'}},
                    market_fee: {type: 'number'},

                    created_at_block: {type: 'string'},
                    created_at_time: {type: 'string'}
                }
            }
        }
    },
    'Template': {
        type: 'object',
        properties: {
            contract: {type: 'string'},
            template_id: {type: 'string'},
            max_supply: {type: 'string'},
            issued_supply: {type: 'string'},
            is_transferable: {type: 'boolean'},
            is_burnable: {type: 'boolean'},

            immutable_data: {type: 'object'},

            created_at_time: {type: 'string'},
            created_at_block: {type: 'string'},

            scheme: {
                type: 'object',
                properties: {
                    schema_name: {type: 'string'},
                    format: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                name: {type: 'string'},
                                type: {type: 'string'}
                            }
                        }
                    },
                    created_at_block: {type: 'string'},
                    created_at_time: {type: 'string'}
                }
            },
            collection: {
                type: 'object',
                properties: {
                    collection_name: {type: 'string'},
                    name: {type: 'string'},
                    author: {type: 'string'},
                    allow_notify: {type: 'boolean'},
                    authorized_accounts: {type: 'array', items: {type: 'string'}},
                    notify_accounts: {type: 'array', items: {type: 'string'}},
                    market_fee: {type: 'number'},

                    created_at_block: {type: 'string'},
                    created_at_time: {type: 'string'}
                }
            }
        }
    },
    'Offer': generateOfferSchema('Asset'),
    'Transfer': generateTransferSchema('Asset'),
    'Log': LogSchema
};

export const greylistFilterParameters = [
    {
        name: 'collection_blacklist',
        in: 'query',
        description: 'Hide collections from result. Split multiple with ","',
        required: false,
        schema: {type: 'string'}
    },
    {
        name: 'collection_whitelist',
        in: 'query',
        description: 'Show only results from specific collections. Split multiple with ","',
        required: false,
        schema: {type: 'string'}
    }
];

export const baseAssetFilterParameters = [
    {
        name: 'collection_name',
        in: 'query',
        description: 'Filter by collection name',
        required: false,
        schema: {type: 'string'}
    },
    {
        name: 'schema_name',
        in: 'query',
        description: 'Filter by schema name',
        required: false,
        schema: {type: 'string'}
    },
    {
        name: 'template_id',
        in: 'query',
        description: 'Filter by template id',
        required: false,
        schema: {type: 'integer'}
    },
    {
        name: 'is_transferable',
        in: 'query',
        description: 'Filter for transferable assets',
        required: false,
        schema: {type: 'boolean'}
    },
    {
        name: 'is_burnable',
        in: 'query',
        description: 'Filter for burnable assets',
        required: false,
        schema: {type: 'boolean'}
    },
    {
        name: 'burned',
        in: 'query',
        description: 'Filter for burned assets',
        required: false,
        schema: {type: 'boolean'}
    },
];

export const assetFilterParameters = [
    {
        name: 'owner',
        in: 'query',
        description: 'Filter by owner',
        required: false,
        schema: {type: 'string'}
    },
    {
        name: 'burned',
        in: 'query',
        description: 'Filter by burned',
        required: false,
        schema: {type: 'boolean'}
    },
    ...baseAssetFilterParameters,
    {
        name: 'match',
        in: 'query',
        description: 'Search for input in asset name',
        required: false,
        schema: {type: 'string'}
    },
    {
        name: 'is_transferable',
        in: 'query',
        description: 'Check if asset is transferable',
        required: false,
        schema: {type: 'boolean'}
    },
    {
        name: 'is_burnable',
        in: 'query',
        description: 'Check if asset is burnable',
        required: false,
        schema: {type: 'boolean'}
    },
    ...greylistFilterParameters
];

export const hideOffersParameters = [
    {
        name: 'hide_offers',
        in: 'query',
        description: 'Hide assets which are used in an offer',
        required: false,
        schema: {type: 'boolean'}
    }
];

export const atomicDataFilter =
    'You can filter the result by specific asset / template data fields.' +
    'You can add for example &template_data.rarity=common to only receive results which have an attribute "rarity" with the value "common". ' +
    'You can query specific asset data by using &immutable_data.rarity=common or &mutable_data.rarity=common .' +
    'If you want to query a non text type you need to specify it explicitly (defaults to text type) like data:bool.foil=true or data:number.id=4 or data:text.rarity=common. ' +
    'Integers which are defined greater than 32 bit (eg 64 bit) in the schema need to be queried as text.';
