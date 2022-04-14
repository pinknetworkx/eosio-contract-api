
export const neftyBlendsComponents = {
    // @TODO:
    'BlendDetails': {
        type: 'object',
        properties: {
            blend_id: {type: 'string'},
            contract: {type: 'string'},
            collection_name: {type: 'string'},
            start_time: {type: 'string'},
            end_time: {type: 'string'},
            max: {type: 'string'},
            use_count: {type: 'string'},
            display_data: {type: 'string'},
            created_at_time: {type: 'string'},
            ingredients_count: {type: 'string'},
            security_id: {type: 'string'},
            is_hidden: {type: 'boolean', default: false},
            category: {type: 'string'},
            ingredients: {
                type: 'array',
                // @TODO:
                // There is actually 3 different possible structures, 
                // template_ingredient, attribute_ingredient and schema_ingredient
                // but I dont know how to do unions here. For now `any` is good enough
                items: {type: 'object'}
            },
            rolls: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        total_odds: {type: 'number'},
                        outcomes:{
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    odds: {type: 'number'},
                                    results: {
                                        type: 'array',
                                        // @TODO:
                                        // There is actually 2 different possible 
                                        // structures, template_result, pool_nft_result
                                        // but I dont know how to do unions here. 
                                        // For now `any` is good enough
                                        items: {type: 'object'}
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
    }
};