import DataProcessor from '../../../processor';
import { ContractDBTransaction } from '../../../database';
import { EosioContractRow } from '../../../../types/eosio';
import { ShipBlock } from '../../../../types/ship';
import CollectionsListHandler, {
    NeftyQuestArgs, NeftyQuestUpdatePriority,
} from '../index';
import ConnectionManager from '../../../../connections/manager';
import { QuestsTableRow } from '../types/tables';
import {
    bulkInsert,
    encodeDatabaseJson,
    getAllRowsFromTable
} from '../../../utils';
import {preventInt64Overflow} from '../../../../utils/binary';

const fillQuests = async (args: NeftyQuestArgs, connection: ConnectionManager): Promise<void> => {
    const questsCount = await connection.database.query(
        'SELECT COUNT(*) FROM neftyquest_quests WHERE contract = $1',
        [args.neftyquest_account]
    );

    if (Number(questsCount.rows[0].count) === 0) {
        const questsTable = await getAllRowsFromTable(connection.chain.rpc, {
            json: true, code: args.neftyquest_account,
            scope: args.neftyquest_account, table: 'quests'
        }, 1000) as QuestsTableRow[];

        const questRows = questsTable.map(quest => getQuestRow(quest, args));
        await bulkInsert(connection.database, 'neftyquest_quests', questRows);
    }
};

export async function initQuests(args: NeftyQuestArgs, connection: ConnectionManager): Promise<void> {
    await fillQuests(args, connection);
}

const questsTableListener = (core: CollectionsListHandler) => async (db: ContractDBTransaction, block: ShipBlock, delta: EosioContractRow<QuestsTableRow>): Promise<void> => {
    const quest = await db.query(
        'SELECT quest_id FROM neftyquest_quests WHERE contract = $1 AND quest_id = $2',
        [core.args.neftyquest_account, delta.value.quest_id]
    );

    if (!delta.present) {
        const deleteString = 'contract = $1 AND quest_id = $2';
        const deleteValues = [core.args.neftyquest_account, delta.value.quest_id];
        await db.delete('neftyquest_quests', {
            str: deleteString,
            values: deleteValues,
        });
    } else if (quest.rowCount === 0) {
        const questRow = getQuestRow(delta.value, core.args);
        await db.insert('neftyquest_quests', questRow, ['contract', 'quest_id']);
    } else {
        const questRow = getQuestRow(delta.value, core.args);
        delete questRow.quest_id;
        delete questRow.contract;
        await db.update('neftyblends_blends', {
           ...questRow
        }, {
            str: 'contract = $1 AND quest_id = $2',
            values: [core.args.neftyquest_account, delta.value.quest_id]
        }, ['contract', 'quest_id']);
    }
};

export function questsProcessor(core: CollectionsListHandler, processor: DataProcessor): () => any {
    const destructors: Array<() => any> = [];
    destructors.push(processor.onContractRow(
        core.args.neftyquest_account, 'blends',
        questsTableListener(core),
        NeftyQuestUpdatePriority.TABLE_QUEST.valueOf()
    ));
    return (): any => destructors.map(fn => fn());
}

function getQuestRow(quest: QuestsTableRow, args: NeftyQuestArgs): any {
    const bonus = quest.bonus.map(x => ({
        score: x.score,
        amount: x.amount,
        element: {
            type: x.element[0],
            ...x.element[1],
        },
    }));

    return {
        contract: args.neftyquest_account,
        quest_id: quest.quest_id,
        start_time: quest.start_time * 1000,
        end_time: quest.end_time * 1000,
        points_per_asset: quest.points_per_asset,
        min_asset_value: preventInt64Overflow(quest.min_asset_value.split(' ')[0].replace('.', '')),
        min_asset_value_symbol: quest.min_asset_value.split(' ')[1],
        points_per_volume: quest.points_per_volume,
        volume_threshold: preventInt64Overflow(quest.volume_threshold.split(' ')[0].replace('.', '')),
        volume_threshold_symbol: quest.volume_threshold.split(' ')[1],
        minimum_volume: preventInt64Overflow(quest.minimum_volume.split(' ')[0].replace('.', '')),
        minimum_volume_symbol: quest.minimum_volume.split(' ')[1],
        completion_multiplier: quest.completion_multiplier,
        bonus: encodeDatabaseJson(bonus),
    };
}
