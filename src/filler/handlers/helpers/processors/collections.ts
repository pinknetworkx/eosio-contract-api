import DataProcessor from '../../../processor';
import { ContractDBTransaction } from '../../../database';
import { EosioContractRow } from '../../../../types/eosio';
import { ShipBlock } from '../../../../types/ship';
import { eosioTimestampToDate } from '../../../../utils/eosio';
import CollectionsListHandler, {CollectionsListArgs, HelpersUpdatePriority} from '../index';
import ConnectionManager from '../../../../connections/manager';
import {AccListTableRow, FeaturesTableRow} from '../types/tables';

const atomicCollectionListRegex = /^col\..*$/g;
const neftyCollectionListRegex = /^whitelist|verified|blacklist|nsfw$/g;

export async function initCollections(args: CollectionsListArgs, connection: ConnectionManager): Promise<void> {
    const featuresQuery = await connection.database.query(
        'SELECT * FROM helpers_collection_list WHERE assets_contract = $1',
        [args.atomicassets_account]
    );

    if (featuresQuery.rows.length === 0) {
        const featuresTable = await connection.chain.rpc.get_table_rows({
            json: true, code: args.features_account,
            scope: args.features_account, table: 'features'
        });

        const atomicAccountsTable = await connection.chain.rpc.get_table_rows({
            json: true, code: args.hub_tools_account,
            scope: args.hub_tools_account, table: 'acclists'
        });

        const databaseRows = [
            ...featuresTable.rows.filter(list => list.list.match(neftyCollectionListRegex)).flatMap((row: FeaturesTableRow) => {
                return [...new Set(row.collections)].map(collection => ({
                    assets_contract: args.atomicassets_account,
                    contract: args.features_account,
                    list: convertCollectionListName(args.features_account, row.list, args),
                    collection_name: collection,
                }));
            }),
            ...atomicAccountsTable.rows.filter(list => list.list_name.match(atomicCollectionListRegex)).flatMap((row: AccListTableRow) => {
                return [...new Set(row.list)].filter(collection => collection.length <= 13).map(collection => ({
                    assets_contract: args.atomicassets_account,
                    contract: args.hub_tools_account,
                    list: convertCollectionListName(args.hub_tools_account, row.list_name, args),
                    collection_name: collection,
                }));
            }),
        ];

        let varCounter = 0;
        const values = databaseRows.map(() =>
            `($${++varCounter},$${++varCounter},$${++varCounter},$${++varCounter},$${++varCounter},$${++varCounter})`,
        ).join(',');

        if (databaseRows.length > 0) {
            await connection.database.query(
                'INSERT INTO helpers_collection_list (' +
                'assets_contract, contract, list, collection_name, updated_at_block, updated_at_time' +
                ') VALUES ' + values,
                databaseRows.flatMap(row => ([
                    row.assets_contract,
                    row.contract,
                    row.list,
                    row.collection_name,
                    0,
                    0
                ]))
            );
        }
    }
}

export function collectionsProcessor(core: CollectionsListHandler, processor: DataProcessor): () => any {
    const destructors: Array<() => any> = [];
    const neftyContract = core.args.features_account;
    const atomicContract = core.args.hub_tools_account;

    destructors.push(processor.onContractRow(
        neftyContract, 'features',
        async (db: ContractDBTransaction, block: ShipBlock, delta: EosioContractRow<FeaturesTableRow>): Promise<void> => {
            if (delta.value.list.match(neftyCollectionListRegex)) {
                const listName = convertCollectionListName(neftyContract, delta.value.list, core.args);
                await db.delete('helpers_collection_list', {
                    str: 'assets_contract = $1 AND contract = $2 AND list = $3',
                    values: [core.args.atomicassets_account, neftyContract, listName]
                });

                if (delta.present && delta.value.collections.length > 0) {
                    const collections = [...new Set(delta.value.collections)];
                    await db.insert('helpers_collection_list', collections.map(collection => {
                        return {
                            assets_contract: core.args.atomicassets_account,
                            contract: neftyContract,
                            list: listName,
                            collection_name: collection,
                            updated_at_block: block.block_num,
                            updated_at_time: eosioTimestampToDate(block.timestamp).getTime(),
                        };
                    }), ['assets_contract', 'collection_name', 'contract', 'list']);
                }
            }
        }, HelpersUpdatePriority.TABLE_FEATURES.valueOf()
    ));

    destructors.push(processor.onContractRow(
        atomicContract, 'acclists',
        async (db: ContractDBTransaction, block: ShipBlock, delta: EosioContractRow<AccListTableRow>): Promise<void> => {
            if (delta.value.list_name.match(atomicCollectionListRegex)) {
                const listName = convertCollectionListName(atomicContract, delta.value.list_name, core.args);
                await db.delete('helpers_collection_list', {
                    str: 'assets_contract = $1 AND contract = $2 AND list = $3',
                    values: [core.args.atomicassets_account, atomicContract, listName]
                });

                if (delta.present && delta.value.list.length > 0) {
                    const collections = [...new Set(delta.value.list)].filter(x => x.length <= 13);
                    await db.insert('helpers_collection_list', collections.map(collection => {
                        return {
                            assets_contract: core.args.atomicassets_account,
                            contract: atomicContract,
                            list: listName,
                            collection_name: collection,
                            updated_at_block: block.block_num,
                            updated_at_time: eosioTimestampToDate(block.timestamp).getTime(),
                        };
                    }), ['assets_contract', 'collection_name', 'contract', 'list']);
                }
            }
        }, HelpersUpdatePriority.TABLE_FEATURES.valueOf()
    ));

    return (): any => destructors.map(fn => fn());
}

function convertCollectionListName(contract: string, list_name: string, args: CollectionsListArgs): string {
    let list = '';
    if (contract === args.hub_tools_account) {
        if (list_name === 'col.wlist') {
            list = 'whitelist';
        } else if (list_name === 'col.blist') {
            list = 'blacklist';
        } else if (list_name === 'col.verify') {
            list = 'verified';
        } else if (list_name === 'col.nsfw') {
            list = 'nsfw';
        } else if (list_name === 'col.scam') {
            list = 'scam';
        }
    } else if (contract === args.features_account) {
        if (list_name === 'whitelist') {
            list = 'whitelist';
        } else if (list_name === 'blacklist') {
            list = 'blacklist';
        } else if (list_name === 'verified') {
            list = 'verified';
        } else if (list_name === 'nsfw') {
            list = 'nsfw';
        } else if (list_name === 'scam') {
            list = 'scam';
        }
    }
    return list;
}
