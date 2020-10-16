import { atomicassetsComponents } from '../atomicassets/openapi';

export const atomictoolsComponents = {
    Link: {
        type: 'object',
        properties: {
            tools_contract: {type: 'string'},
            assets_contract: {type: 'string'},
            link_id: {type: 'string'},
            creator: {type: 'string'},
            claimer: {type: 'string', nullable: true},
            state: {type: 'integer'},
            public_key: {type: 'string'},
            memo: {type: 'string'},
            txid: {type: 'string'},
            assets: {
                type: 'array',
                items: {'$ref': '#/components/schemas/Asset'}
            },
            created_at_block: {type: 'string'},
            created_at_time: {type: 'string'}
        }
    },
    Asset: atomicassetsComponents.Asset
};
