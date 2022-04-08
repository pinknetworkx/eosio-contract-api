import { RequestValues } from '../../utils';
import { NeftyQuestContext } from '../index';
import { ApiError } from '../../../error';

export async function getConfigAction(params: RequestValues, ctx: NeftyQuestContext): Promise<any> {
    const configQuery = await ctx.db.query(
        'SELECT * FROM neftyquest_config WHERE contract = $1',
        [ctx.coreArgs.neftyquest_account]
    );

    if (configQuery.rowCount === 0) {
        throw new ApiError('Config not found');
    }

    const config = configQuery.rows[0];
    return {
        contract: config.contract,
        collection_name: config.collection_name,
        template_id: +config.template_id,
        balance_attribute_name: config.balance_attribute_name,
        quest_duration: +config.quest_duration,
        points_per_asset: +config.points_per_asset,
        min_asset_value: +config.min_asset_value,
        min_asset_value_symbol:config.min_asset_value_symbol,
        points_per_volume: +config.points_per_volume,
        volume_threshold: +config.volume_threshold,
        volume_threshold_symbol: config.volume_threshold_symbol,
        minimum_volume: +config.minimum_volume,
        minimum_volume_symbol: config.minimum_volume_symbol,
        quest_attribute_name: config.quest_attribute_name,
    };
}
