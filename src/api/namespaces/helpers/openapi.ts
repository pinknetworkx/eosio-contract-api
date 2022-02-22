export const neftyMarketComponents = {
    'CollectionStatus': {
        type: 'object',
        properties: {
            collection_name: {type: 'string'},
            lists: {
                type: 'array',
                elements: {
                    type: 'object',
                    properties: {
                        contract: {type: 'string'},
                        list: {type: 'string'}
                    }
                }
            }
        }
    }
};
