export const schemas = {
    Asset: {
        type: 'object',
        properties: {
            contract: {type: 'string'},
            asset_id: {type: 'integer'},
            owner: {type: 'string'},
            name: {type: 'string'},
            is_transferable: {type: 'boolean'},
            is_burnable: {type: 'boolean'},

            sale: {
                type: 'object',
                properties: {
                    seller: {type: 'string'},
                    price: {type: 'number'},
                    symbol: {type: 'string'},
                    precision: {type: 'number'},
                    blacklisted: {type: 'boolean'}
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
                    market_fee: {type: 'boolean'},
                    created_at_block: {type: 'integer'},
                    created_at_time: {type: 'integer'},
                    verified: {type: 'boolean'}
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
                    created_at_block: {type: 'integer'},
                    created_at_time: {type: 'integer'}
                }
            },
            template: {
                type: 'object',
                properties: {
                    template_id: {type: 'integer'},
                    max_supply: {type: 'integer'},
                    issued_supply: {type: 'integer'},
                    is_transferable: {type: 'boolean'},
                    is_burnable: {type: 'boolean'},

                    immutable_data: {type: 'object'},

                    created_at_time: {type: 'integer'},
                    created_at_block: {type: 'integer'}
                }
            },

            backed_tokens: {
                type: 'array', items: {
                    type: 'object',
                    properties: {
                        token_contract: {type: 'string'},
                        token_symbol: {type: 'string'},
                        token_precision: {type: 'integer'},
                        amount: {type: 'integer'}
                    }
                }
            },

            immutable_data: {type: 'object'},
            mutable_data: {type: 'object'},
            data: {type: 'object'},

            burned_at_block: {type: 'integer'},
            burned_at_time: {type: 'integer'},
            updated_at_block: {type: 'integer'},
            updated_at_time: {type: 'integer'},
            minted_at_block: {type: 'integer'},
            minted_at_time: {type: 'integer'}
        }
    }
};
