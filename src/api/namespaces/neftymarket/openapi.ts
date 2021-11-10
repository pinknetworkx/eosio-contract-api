export const neftyMarketComponents = {
    'AttributeValueFilter': {
        type: 'object',
        properties: {
            key: {type: 'string'},
            // @TODO: Misleading, value can be any JSON primitive
            value: {type: 'string'},
        }
    }
};
