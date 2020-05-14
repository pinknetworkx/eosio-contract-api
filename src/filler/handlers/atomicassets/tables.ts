import { deserialize, ObjectSchema } from 'atomicassets';

import { ContractDBTransaction } from '../../database';
import { ShipBlock } from '../../../types/ship';
import { EosioTableRow } from '../../../types/eosio';
import {
    AssetsTableRow,
    BalancesTableRow,
    CollectionsTableRow,
    ConfigTableRow,
    OffersTableRow,
    PresetsTableRow,
    SchemesTableRow,
    TokenConfigsTableRow
} from './types/tables';
import AtomicAssetsHandler, { OfferAssetState, OfferState } from './index';
import logger from '../../../utils/winston';
import { deserializeEosioName, eosioTimestampToDate, serializeEosioName } from '../../../utils/eosio';

export default class AtomicAssetsTableHandler {
    private readonly contractName: string;
    
    constructor(readonly core: AtomicAssetsHandler) { 
        this.contractName = serializeEosioName(this.core.args.atomicassets_account);
    }

    async handleUpdate(db: ContractDBTransaction, block: ShipBlock, delta: EosioTableRow): Promise<void> {
        if (typeof delta.value === 'string') {
            throw new Error('Data of atomicassets table could not be deserialized: ' + delta.table);
        }

        if (delta.code !== this.core.args.atomicassets_account) {
            logger.warn('[atomicassets] Received table delta from wrong contract: ' + delta.code);
        }

        if (delta.table === 'assets') {
            // @ts-ignore
            await this.handleAssetsUpdate(db, block, delta.scope, delta.value, !delta.present);
        } else if (delta.table === 'balances' && delta.scope === this.core.args.atomicassets_account) {
            // @ts-ignore
            await this.handleBalancesUpdate(db, block, delta.value, !delta.present);
        } else if (delta.table === 'collections' && delta.scope === this.core.args.atomicassets_account) {
            // @ts-ignore
            await this.handleCollectionsUpdate(db, block, delta.value, !delta.present);
        } else if (delta.table === 'offers' && delta.scope === this.core.args.atomicassets_account) {
            // @ts-ignore
            await this.handleOffersUpdate(db, block, delta.value, !delta.present);
        } else if (delta.table === 'presets' && delta.scope === this.core.args.atomicassets_account) {
            // @ts-ignore
            await this.handlePresetsUpdate(db, block, delta.scope, delta.value, !delta.present);
        } else if (delta.table === 'schemes') {
            // @ts-ignore
            await this.handleSchemesUpdate(db, block, delta.scope, delta.value, !delta.present);
        } else if (delta.table === 'config' && delta.scope === this.core.args.atomicassets_account) {
            // @ts-ignore
            const data: ConfigTableRow = delta.value;

            await db.delete('atomicassets_token_symbols', {
                str: 'contract = $1',
                values: [this.contractName]
            });

            for (const token of data.token_symbols) {
                await db.insert('atomicassets_token_symbols', {
                    contract: this.contractName,
                    token_symbol: serializeEosioName(token.token_symbol.split(',')[1].toLowerCase()),
                    token_contract: token.token_contract,
                    token_precision: token.token_symbol.split(',')[0]
                }, ['contract', 'token_symbol']);
            }

            await db.update('atomicassets_config', {
                collection_format: data.collection_format.map((element: any) => JSON.stringify(element))
            }, {
                str: 'contract = $1',
                values: [this.contractName]
            }, ['contract']);
        } else if (delta.table === 'tokenconfigs' && delta.scope === this.core.args.atomicassets_account) {
            // @ts-ignore
            const data: TokenConfigsTableRow = delta.value;

            await db.update('atomicassets_config', {
                version: data.version
            }, {
                str: 'contract = $1',
                values: [this.contractName]
            }, ['contract']);
        } else {
            logger.warn('[atomicassets] Received table delta from unknown table: ' + delta.table + ' - ' + delta.scope);
        }
    }

    async handleAssetsUpdate(
        db: ContractDBTransaction, block: ShipBlock, scope: string, data: AssetsTableRow, deleted: boolean
    ): Promise<void> {
        const schemeQuery = await db.query(
            'SELECT format FROM atomicassets_schemes WHERE contract = $1 AND collection_name = $2 AND scheme_name = $3',
            [
                this.contractName,
                serializeEosioName(data.collection_name),
                serializeEosioName(data.scheme_name)
            ]
        );

        if (schemeQuery.rowCount === 0) {
            throw new Error('Scheme for asset not found');
        }

        const scheme = ObjectSchema(schemeQuery.rows[0].format);

        const mutableData = deserialize(new Uint8Array(data.mutable_serialized_data), scheme);
        const immutableData = deserialize(new Uint8Array(data.immutable_serialized_data), scheme);

        let presetName = null;

        if (data.preset_id >= 0) {
            const presetQuery = await db.query(
                'SELECT value FROM atomicassets_presets_data WHERE key = $1 AND contract = $2 AND preset_id = $3',
                ['name', this.contractName, data.preset_id]
            );

            if (presetQuery.rowCount === 0) {
                throw new Error('Preset for asset not found');
            }

            presetName = presetQuery.rows[0].value;
        }

        await db.replace('atomicassets_assets', {
            contract: this.contractName,
            asset_id: data.asset_id,
            collection_name: serializeEosioName(data.collection_name),
            scheme_name: serializeEosioName(data.scheme_name),
            preset_id: data.preset_id,
            owner: serializeEosioName(scope),
            readable_name: String(presetName ? presetName : (immutableData.name ? immutableData.name : mutableData.name)),
            ram_payer: serializeEosioName(data.ram_payer),
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

            localBackedTokens[split[1].toLowerCase()] = {
                amount: split[0].replace('.', ''),
                token_symbol: split[1].toLowerCase()
            };
        }

        const backedTokensQuery = await db.query(
            'SELECT token_symbol, amount FROM atomicassets_assets_backed_tokens WHERE contract = $1 AND asset_id = $2',
            [this.contractName, data.asset_id]
        );

        for (const dbBackedToken of backedTokensQuery.rows) {
            const symbol = deserializeEosioName(dbBackedToken.token_symbol);

            if (typeof localBackedTokens[symbol] === 'undefined') {
                await db.delete('atomicassets_assets_backed_tokens', {
                    str: 'contract = $1 AND asset_id = $2 AND token_symbol = $3',
                    values: [this.contractName, data.asset_id, dbBackedToken.token_symbol]
                });
            } else {
                if (dbBackedToken.amount !== localBackedTokens[symbol].amount) {
                    await db.update('atomicassets_assets_backed_tokens', {
                        amount: localBackedTokens[symbol].amount
                    }, {
                        str: 'contract = $1 AND asset_id = $2 AND token_symbol = $3',
                        values: [
                            this.contractName,
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
                contract: this.contractName,
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
            [this.contractName, data.asset_id]
        ));

        for (const dbData of dbDataQuery.rows) {
            const key = [dbData.key, dbData.mutable ? 'mutable' : 'immutable'].join(':');

            if (typeof localData[key] === 'undefined') {
                await db.delete('atomicassets_assets_data', {
                    str: 'contract = $1 AND asset_id = $2 AND key = $3 AND mutable = $4',
                    values: [this.contractName, data.asset_id, dbData.key, dbData.mutable]
                });
            } else {
                if (JSON.stringify(dbData.value) !== localData[key].value) {
                    await db.update('atomicassets_assets_data', {
                        value: localData[key].value
                    }, {
                        str: 'contract = $1 AND asset_id = $2 AND key = $3 AND mutable = $4',
                        values: [this.contractName, data.asset_id, dbData.key, dbData.mutable]
                    }, ['contract', 'asset_id', 'key', 'mutable']);
                }

                delete localData[key];
            }
        }

        for (const key of Object.keys(localData)) {
            await db.insert('atomicassets_assets_data', {
                ...localData[key],
                contract: this.contractName,
                asset_id: data.asset_id,
                updated_at_block: block.block_num,
                updated_at_time: eosioTimestampToDate(block.timestamp).getTime()
            }, ['contract', 'asset_id', 'key', 'mutable']);
        }
    }

    async handleBalancesUpdate(
        db: ContractDBTransaction, block: ShipBlock, data: BalancesTableRow, _: boolean
    ): Promise<void> {
        await db.delete('atomicassets_balances', {
            str: 'contract = $1 AND owner = $2 AND token_symbol NOT IN ($3)',
            values: [
                this.contractName,
                serializeEosioName(data.owner),
                data.quantities.map((quantity) => serializeEosioName(quantity.split(' ')[1].toLowerCase()))
            ]
        });

        for (const quantity of data.quantities) {
            await db.replace('atomicassets_balances', {
                contract: this.contractName,
                owner: serializeEosioName(data.owner),
                token_symbol: serializeEosioName(quantity.split(' ')[1].toLowerCase()),
                amount: quantity.split(' ')[0].replace('.', ''),
                updated_at_block: block.block_num,
                updated_at_time: eosioTimestampToDate(block.timestamp).getTime()
            }, ['contract', 'owner', 'token_symbol']);
        }
    }

    async handleCollectionsUpdate(
        db: ContractDBTransaction, block: ShipBlock, data: CollectionsTableRow, deleted: boolean
    ): Promise<void> {
        if (deleted) {
            throw new Error('A collection was deleted. Should not be possible by contract');
        }

        const deserializedData = deserialize(new Uint8Array(data.serialized_data), this.core.config.collection_format);

        await db.replace('atomicassets_collections', {
            contract: this.contractName,
            collection_name: data.collection_name,
            readable_name: deserializedData.name || '',
            author: serializeEosioName(data.author),
            allow_notify: data.allow_notify,
            authorized_accounts: data.authorized_accounts.map((account) => serializeEosioName(account)),
            notify_accounts: data.notify_accounts.map((account) => serializeEosioName(account)),
            market_fee: data.market_fee,
            data: JSON.stringify(deserializedData),
            created_at_block: block.block_num,
            created_at_time: eosioTimestampToDate(block.timestamp).getTime()
        }, ['contract', 'collection_name'], ['created_at_block', 'created_at_time']);
    }

    async handleOffersUpdate(
        db: ContractDBTransaction, block: ShipBlock, data: OffersTableRow, deleted: boolean
    ): Promise<void> {
        if (deleted) {
            await db.update('atomicassets_offers', {
                state: OfferState.UNKNOWN
            }, {
                str: 'contract = $1 AND offer_id = $2 AND state = $3',
                values: [
                    this.contractName,
                    data.offer_id, OfferState.PENDING
                ]
            }, ['contract', 'offer_id']);
        } else {
            const offerQuery = await db.query(
                'SELECT offer_id FROM atomicassets_offers WHERE contract = $1 AND offer_id = $2',
                [this.contractName, data.offer_id]
            );

            if (offerQuery.rowCount > 0) {
                throw new Error('Offer row was updated. Should not be possible by contract');
            }

            const missingAssetsQuery = await db.query(
                'SELECT asset_id FROM atomicassets_assets WHERE contract = $1 AND ((owner = $2 AND asset_id IN ($3)) OR (owner = $4 AND asset_id IN ($5)))',
                [
                    this.contractName,
                    serializeEosioName(data.offer_sender),
                    data.sender_asset_ids,
                    serializeEosioName(data.offer_recipient),
                    data.recipient_asset_ids
                ]
            );
            const missingAssets = missingAssetsQuery.rows.map((row) => row.asset_id);

            await db.insert('atomicassets_offers', {
                contract: this.contractName,
                offer_id: data.offer_id,
                sender: data.offer_sender,
                recipient: data.offer_recipient,
                memo: data.memo.substring(0, 64),
                state: missingAssets.length > 0 ? OfferState.INVALID : OfferState.PENDING,
                updated_at_block: block.block_num,
                updated_at_time: eosioTimestampToDate(block.timestamp).getTime(),
                created_at_block: block.block_num,
                created_at_time: eosioTimestampToDate(block.timestamp).getTime()
            }, ['contract', 'offer_id']);

            const values = [];

            for (const assetID of data.recipient_asset_ids) {
                values.push({
                    contract: this.contractName,
                    offer_id: data.offer_id,
                    owner: data.offer_recipient,
                    asset_id: assetID,
                    state: missingAssets.indexOf(assetID) >= 0 ? OfferAssetState.MISSING : OfferAssetState.NORMAL
                });
            }

            for (const assetID of data.sender_asset_ids) {
                values.push({
                    contract: this.contractName,
                    offer_id: data.offer_id,
                    owner: data.offer_sender,
                    asset_id: assetID,
                    state: missingAssets.indexOf(assetID) >= 0 ? OfferAssetState.MISSING : OfferAssetState.NORMAL
                });
            }

            await db.insert('atomicassets_offers_assets', values, ['contract', 'offer_id', 'asset_id']);
        }
    }

    async handlePresetsUpdate(
        db: ContractDBTransaction, block: ShipBlock, scope: string, data: PresetsTableRow, deleted: boolean
    ): Promise<void> {
        if (deleted) {
            throw new Error('A preset was deleted. Should not be possible by contract');
        }

        await db.replace('atomicassets_presets', {
            contract: this.contractName,
            preset_id: data.preset_id,
            collection_name: serializeEosioName(scope),
            scheme_name: serializeEosioName(data.scheme_name),
            transferable: data.transferable,
            burnable: data.burnable,
            max_supply: data.max_supply,
            issued_supply: data.issued_supply,
            created_at_block: block.block_num,
            created_at_time: eosioTimestampToDate(block.timestamp).getTime()
        }, ['contract', 'preset_id'], ['created_at_block', 'created_at_time']);

        const schemeQuery = await db.query(
            'SELECT format FROM atomicassets_scheme WHERE contract = $1 AND collection_name = $2 AND scheme_name = $3'
        );

        if (schemeQuery.rowCount === 0) {
            throw new Error('Scheme of preset not found. Should not be possible by contract');
        }

        const immutableData = deserialize(new Uint8Array(data.immutable_serialized_data), ObjectSchema(schemeQuery.rows[0].format));

        await db.query(
            'DELETE FROM atomicassets_presets_data WHERE contract = $1 AND preset_id = $2',
            [this.contractName, data.preset_id]
        );

        const keys = Object.keys(immutableData);
        const values = [];

        for (const key of keys) {
            values.push({
                contract: this.contractName,
                preset_id: data.preset_id,
                key, value: JSON.stringify(immutableData[key])
            });
        }

        await db.insert('atomicassets_preset_data', values, ['contract', 'preset_id', 'key']);
    }

    async handleSchemesUpdate(
        db: ContractDBTransaction, block: ShipBlock, scope: string, data: SchemesTableRow, deleted: boolean
    ): Promise<void> {
        if (deleted) {
            throw new Error('A scheme was deleted. Should not be possible by contract');
        }

        await db.replace('atomicassets_schemes', {
            contract: this.contractName,
            collection_name: serializeEosioName(scope),
            scheme_name: serializeEosioName(data.scheme_name),
            format: data.format.map((element: any) => JSON.stringify(element)),
            created_at_block: block.block_num,
            created_at_time: eosioTimestampToDate(block.timestamp).getTime()
        }, ['contract', 'collection_name', 'scheme_name'], ['created_at_block', 'created_at_time']);
    }
}
