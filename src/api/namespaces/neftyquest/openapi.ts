export const neftyQuestComponents = {
    'LeaderboardItem': {
        type: 'object',
        properties: {
            rank: { type: 'number' },
            account: { type: 'string' },
            total_sold: { type: 'number' },
            total_bought: { type: 'number' },
            symbol: { type: 'string' },
            symbol_precision: { type: 'number' },
            items_sold: { type: 'number' },
            items_bought: { type: 'number' },
            total_collected: { type: 'number' },
            completion_percentage: { type: 'number' },
            experience: { type: 'number' },
        }
    },
    'QuestItem': {
        type: 'object',
        properties: {
            contract: { type: 'string' },
            quest_id: { type: 'number' },
            start_time: { type: 'number' },
            end_time: { type: 'number' },
            points_per_asset: { type: 'number' },
            min_asset_value: { type: 'number' },
            min_asset_value_symbol: { type: 'string' },
            points_per_volume: { type: 'number' },
            volume_threshold: { type: 'number' },
            volume_threshold_symbol: { type: 'string' },
            minimum_volume: { type: 'number' },
            minimum_volume_symbol: { type: 'string' },
            bonus: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        score: { type: 'number' },
                        amount: { type: 'number' },
                        element: {
                            type: 'object',
                            properties: {
                                type: { type: 'string' }
                            },
                        }
                    },
                },
            },
            prizes: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        percent: { type: 'number' },
                        balance: { type: 'number' },
                        template_id: { type: 'number' },
                    },
                },
            },
            completion_multiplier: {type: 'number'},
            bonus_threshold: {type: 'number'},
        }
    }
};
