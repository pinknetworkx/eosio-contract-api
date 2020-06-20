import { atomicassetsComponents } from '../atomicassets/openapi';

export const atomictoolsComponents = {
    Link: {
        type: 'object',
        properties: {
            tools_contract: {type: 'string'},
            assets_contract: {type: 'string'},
            link_id: {type: 'integer'},
            creator: {type: 'string'},
            claimer: {type: 'string', nullable: true},
            state: {type: 'integer'},
            key: {type: 'string'},
            memo: {type: 'string'},
            txid: {type: 'string'},
            assets: {
                type: 'array',
                items: {'$ref': '#/components/schemas/Asset'}
            },
            created_at_block: {type: 'integer'},
            created_at_time: {type: 'integer'}
        }
    },
    Asset: atomicassetsComponents.Asset
};
