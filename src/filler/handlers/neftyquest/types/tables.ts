export type QuestsTableRow = {
    quest_id: string,
    start_time: number,
    end_time: number,
    points_per_asset: number,
    min_asset_value: string,
    points_per_volume: number,
    volume_threshold: string,
    minimum_volume: string,
    bonus: Array<{
        score: number,
        amount: number,
        element: Array<any>,
    }>,
    completion_multiplier: number,
};

export type ConfigTableRow = {
    collection_name: string,
    template_id: number,
    balance_attribute_name: string,
    quest_duration: number,
    points_per_asset: number,
    min_asset_value: string,
    points_per_volume: number,
    volume_threshold: string,
    minimum_volume: string,
};
