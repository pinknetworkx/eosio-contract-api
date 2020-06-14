import { deserialize, ObjectSchema } from 'atomicassets';

import { ContractDBTransaction } from '../../database';
import { ShipBlock } from '../../../types/ship';
import { AssetsTableRow, OffersTableRow } from './types/tables';
import { eosioTimestampToDate } from '../../../utils/eosio';
import { OfferState } from './index';
import { AttributeMap } from './types/actions';

export async function saveAssetTableRow(
    db: ContractDBTransaction, block: ShipBlock, contractName: string, scope: string, data: AssetsTableRow,
    deleted: boolean, mutableDataMap?: AttributeMap, immutableDataMap?: AttributeMap
): Promise<void> {
    const schemaQuery = await db.query(
        'SELECT format FROM atomicassets_schemas WHERE contract = $1 AND collection_name = $2 AND schema_name = $3',
        [contractName, data.collection_name, data.schema_name]
    );

    if (schemaQuery.rowCount === 0) {
        throw new Error('AtomicAssets: Schema for asset not found');
    }

    const schema = ObjectSchema(schemaQuery.rows[0].format);

    const mutableData = mutableDataMap
        ? convertAttributeMapToObject(mutableDataMap)
        : deserialize(new Uint8Array(data.mutable_serialized_data), schema);
    const immutableData = immutableDataMap
        ? convertAttributeMapToObject(immutableDataMap)
        : deserialize(new Uint8Array(data.immutable_serialized_data), schema);

    await db.replace('atomicassets_assets', {
        contract: contractName,
        asset_id: data.asset_id,
        collection_name: data.collection_name,
        schema_name: data.schema_name,
        template_id: data.template_id === -1 ? null : data.template_id,
        owner: deleted ? null : scope,
        readable_name:
            (immutableData.name ? String(immutableData.name).substr(0, 64) : null) ||
            (mutableData.name ? String(mutableData.name).substr(0, 64) : null),
        ram_payer: data.ram_payer,
        burned_at_block: deleted ? block.block_num : null,
        burned_at_time: deleted ? eosioTimestampToDate(block.timestamp).getTime() : null,
        updated_at_block: block.block_num,
        updated_at_time: eosioTimestampToDate(block.timestamp).getTime(),
        minted_at_block: block.block_num,
        minted_at_time: eosioTimestampToDate(block.timestamp).getTime()
    }, ['contract', 'asset_id'], ['minted_at_block', 'minted_at_time']);

    // updated backed tokens
    const localBackedTokens: {[key: string]: {amount: string, token_symbol: string}} = {};
    for (const token of data.backed_tokens) {
        const split = token.split(' ');

        localBackedTokens[split[1]] = {
            amount: split[0].replace('.', ''),
            token_symbol: split[1]
        };
    }

    const backedTokensQuery = await db.query(
        'SELECT token_symbol, amount FROM atomicassets_assets_backed_tokens WHERE contract = $1 AND asset_id = $2',
        [contractName, data.asset_id]
    );

    for (const dbBackedToken of backedTokensQuery.rows) {
        const symbol = dbBackedToken.token_symbol;

        if (typeof localBackedTokens[symbol] === 'undefined') {
            await db.delete('atomicassets_assets_backed_tokens', {
                str: 'contract = $1 AND asset_id = $2 AND token_symbol = $3',
                values: [contractName, data.asset_id, dbBackedToken.token_symbol]
            });
        } else {
            if (dbBackedToken.amount !== localBackedTokens[symbol].amount) {
                await db.update('atomicassets_assets_backed_tokens', {
                    amount: localBackedTokens[symbol].amount
                }, {
                    str: 'contract = $1 AND asset_id = $2 AND token_symbol = $3',
                    values: [
                        contractName,
                        data.asset_id, dbBackedToken.token_symbol
                    ]
                }, ['contract', 'asset_id', 'token_symbol']);
            }

            delete localBackedTokens[symbol];
        }
    }

    for (const key of Object.keys(localBackedTokens)) {
        await db.insert('atomicassets_assets_backed_tokens', {
            ...localBackedTokens[key],
            asset_id: data.asset_id,
            contract: contractName,
            updated_at_block: block.block_num,
            updated_at_time: eosioTimestampToDate(block.timestamp).getTime()
        }, ['contract', 'asset_id', 'token_symbol']);
    }

    // update data
    const localData: {[key: string]: {key: string, value: string, mutable: boolean}} = {};
    for (const key of Object.keys(mutableData)) {
        localData[[key, 'mutable'].join(':')] = {
            key: key,
            value: JSON.stringify(mutableData[key]),
            mutable: true
        };
    }
    for (const key of Object.keys(immutableData)) {
        localData[[key, 'immutable'].join(':')] = {
            key: key,
            value: JSON.stringify(immutableData[key]),
            mutable: false
        };
    }

    const dbDataQuery = (await db.query(
        'SELECT "key", "value", mutable FROM atomicassets_assets_data WHERE contract = $1 and asset_id = $2',
        [contractName, data.asset_id]
    ));

    for (const dbData of dbDataQuery.rows) {
        const key = [dbData.key, dbData.mutable ? 'mutable' : 'immutable'].join(':');

        if (typeof localData[key] === 'undefined') {
            await db.delete('atomicassets_assets_data', {
                str: 'contract = $1 AND asset_id = $2 AND key = $3 AND mutable = $4',
                values: [contractName, data.asset_id, dbData.key, dbData.mutable]
            });
        } else {
            if (JSON.stringify(dbData.value) !== localData[key].value) {
                await db.update('atomicassets_assets_data', {
                    value: localData[key].value
                }, {
                    str: 'contract = $1 AND asset_id = $2 AND key = $3 AND mutable = $4',
                    values: [contractName, data.asset_id, dbData.key, dbData.mutable]
                }, ['contract', 'asset_id', 'key', 'mutable']);
            }

            delete localData[key];
        }
    }

    for (const key of Object.keys(localData)) {
        await db.insert('atomicassets_assets_data', {
            ...localData[key],
            contract: contractName,
            asset_id: data.asset_id,
            updated_at_block: block.block_num,
            updated_at_time: eosioTimestampToDate(block.timestamp).getTime()
        }, ['contract', 'asset_id', 'key', 'mutable']);
    }
}

export async function saveOfferTableRow(
    db: ContractDBTransaction, block: ShipBlock, contractName: string, data: OffersTableRow, deleted: boolean
): Promise<void> {
    if (deleted) {
        await db.update('atomicassets_offers', {
            state: OfferState.UNKNOWN.valueOf()
        }, {
            str: 'contract = $1 AND offer_id = $2 AND (state = $3 OR state = $4)',
            values: [
                contractName,
                data.offer_id,
                OfferState.PENDING.valueOf(),
                OfferState.INVALID.valueOf()
            ]
        }, ['contract', 'offer_id']);
    } else {
        const offerQuery = await db.query(
            'SELECT offer_id FROM atomicassets_offers WHERE contract = $1 AND offer_id = $2',
            [contractName, data.offer_id]
        );

        // should not be possible to change offer data
        if (offerQuery.rowCount > 0) {
            return;
        }

        await db.insert('atomicassets_offers', {
            contract: contractName,
            offer_id: data.offer_id,
            sender: data.sender,
            recipient: data.recipient,
            memo: String(data.memo).substring(0, 256),
            state: OfferState.PENDING.valueOf(),
            updated_at_block: block.block_num,
            updated_at_time: eosioTimestampToDate(block.timestamp).getTime(),
            created_at_block: block.block_num,
            created_at_time: eosioTimestampToDate(block.timestamp).getTime()
        }, ['contract', 'offer_id']);

        const values = [];

        for (const assetID of data.recipient_asset_ids) {
            values.push({
                contract: contractName,
                offer_id: data.offer_id,
                owner: data.recipient,
                asset_id: assetID
            });
        }

        for (const assetID of data.sender_asset_ids) {
            values.push({
                contract: contractName,
                offer_id: data.offer_id,
                owner: data.sender,
                asset_id: assetID
            });
        }

        await db.insert('atomicassets_offers_assets', values, ['contract', 'offer_id', 'asset_id']);
    }
}

export function convertAttributeMapToObject(data: AttributeMap): {[key: string]: string} {
    const result: {[key: string]: string} = {};
    for (const row of data) {
        result[row.key] = row.value[1];
    }

    return result;
}
