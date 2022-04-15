export function formatQuest(row: any): any {
    return {
        contract: row.contract,
        quest_id: +row.quest_id,
        start_time: +row.start_time,
        end_time: +row.end_time,
        points_per_asset: +row.points_per_asset,
        min_asset_value: +row.min_asset_value,
        min_asset_value_symbol: row.min_asset_value_symbol,
        points_per_volume: +row.points_per_volume,
        volume_threshold: +row.volume_threshold,
        volume_threshold_symbol: row.volume_threshold_symbol,
        minimum_volume: +row.minimum_volume,
        minimum_volume_symbol: row.minimum_volume_symbol,
        bonus: row.bonus,
        prizes: row.prizes,
        bonus_threshold: +row.bonus_threshold,
    };
}

export function formatLeaderboard(row: any): any {
    return {
        rank: +row.rank,
        account: row.account,
        total_sold: +row.total_sold,
        total_bought: +row.total_bought,
        symbol: row.symbol,
        symbol_precision: +row.symbol_precision,
        items_sold: +row.items_sold,
        items_bought: +row.items_bought,
        total_collected: +row.total_collected,
        completion_percentage: +row.completion_percentage,
        experience: +row.experience,
    };
}
