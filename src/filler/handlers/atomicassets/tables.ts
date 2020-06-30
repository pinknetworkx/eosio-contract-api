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
    TemplatesTableRow,
    SchemasTableRow,
    TokenConfigsTableRow
} from './types/tables';
import AtomicAssetsHandler, { JobPriority } from './index';
import logger from '../../../utils/winston';
import { eosioTimestampToDate } from '../../../utils/eosio';
import { saveAssetTableRow, saveOfferTableRow } from './helper';

export default class AtomicAssetsTableHandler {
    private readonly contractName: string;
    
    constructor(readonly core: AtomicAssetsHandler) { 
        this.contractName = this.core.args.atomicassets_account;
    }

    async handleUpdate(db: ContractDBTransaction, block: ShipBlock, delta: EosioTableRow): Promise<void> {
        if (typeof delta.value === 'string') {
            throw new Error('AtomicAssets: Delta of atomicassets table could not be deserialized: ' + delta.table);
        }

        if (delta.code !== this.core.args.atomicassets_account) {
            logger.warn('[atomicassets] Received table delta from wrong contract: ' + delta.code);

            return;
        }

        logger.debug('AtomicAssets Delta', delta);

        if (delta.table === 'assets') {
            this.core.addUpdateJob(async () => {
                // @ts-ignore
                await this.handleAssetsUpdate(db, block, delta.scope, delta.value, !delta.present);
            }, JobPriority.TABLE_ASSETS);
        } else if (delta.table === 'balances' && delta.scope === this.core.args.atomicassets_account) {
            this.core.addUpdateJob(async () => {
                // @ts-ignore
                await this.handleBalancesUpdate(db, block, delta.value, !delta.present);
            }, JobPriority.TABLE_BALANCES);
        } else if (delta.table === 'collections' && delta.scope === this.core.args.atomicassets_account) {
            this.core.addUpdateJob(async () => {
                // @ts-ignore
                await this.handleCollectionsUpdate(db, block, delta.value, !delta.present);
            }, JobPriority.TABLE_COLLECTIONS);
        } else if (delta.table === 'offers' && delta.scope === this.core.args.atomicassets_account) {
            this.core.addUpdateJob(async () => {
                // @ts-ignore
                await this.handleOffersUpdate(db, block, delta.value, !delta.present);
            }, JobPriority.TABLE_OFFERS);
        } else if (delta.table === 'templates') {
            this.core.addUpdateJob(async () => {
                // @ts-ignore
                await this.handleTemplatesUpdate(db, block, delta.scope, delta.value, !delta.present);
            }, JobPriority.TABLE_PRESETS);
        } else if (delta.table === 'schemas') {
            this.core.addUpdateJob(async () => {
                // @ts-ignore
                await this.handleSchemasUpdate(db, block, delta.scope, delta.value, !delta.present);
            }, JobPriority.TABLE_SCHEMES);
        } else if (delta.table === 'config' && delta.scope === this.core.args.atomicassets_account) {
            this.core.addUpdateJob(async () => {
                // @ts-ignore
                await this.handleConfigUpdate(db, block, delta.value, !delta.present);
            }, JobPriority.TABLE_CONFIG);
        } else if (delta.table === 'tokenconfigs' && delta.scope === this.core.args.atomicassets_account) {
            this.core.addUpdateJob(async () => {
                // @ts-ignore
                await this.handleTokenconfigsUpdate(db, block, delta.value, !delta.present);
            }, JobPriority.TABLE_TOKENCONFIGS);
        } else {
            logger.warn('[atomicassets] Received table delta from unknown table: ' + delta.table + ' - ' + delta.scope);
        }
    }

    async handleAssetsUpdate(
        db: ContractDBTransaction, block: ShipBlock, scope: string, data: AssetsTableRow, deleted: boolean
    ): Promise<void> {
        await saveAssetTableRow(db, block, this.contractName, scope, data, deleted);

        this.core.checkOfferState([], [data.asset_id]);
    }

    async handleBalancesUpdate(
        db: ContractDBTransaction, block: ShipBlock, data: BalancesTableRow, deleted: boolean
    ): Promise<void> {
        await db.delete('atomicassets_balances', {
            str: 'contract = $1 AND owner = $2',
            values: [this.contractName, data.owner]
        });

        if (deleted) {
            return;
        }

        await db.insert('atomicassets_balances', data.quantities.map(quantity => ({
            contract: this.contractName,
            owner: data.owner,
            token_symbol: quantity.split(' ')[1],
            amount: quantity.split(' ')[0].replace('.', ''),
            updated_at_block: block.block_num,
            updated_at_time: eosioTimestampToDate(block.timestamp).getTime()
        })), ['contract', 'owner', 'token_symbol']);
    }

    async handleCollectionsUpdate(
        db: ContractDBTransaction, block: ShipBlock, data: CollectionsTableRow, deleted: boolean
    ): Promise<void> {
        if (deleted) {
            throw new Error('AtomicAssets: A collection was deleted. Should not be possible by contract');
        }

        let byteData;
        if (typeof data.serialized_data === 'string') {
            byteData = Uint8Array.from(Buffer.from(data.serialized_data, 'hex'));
        } else {
            byteData = new Uint8Array(data.serialized_data);
        }

        const deserializedData = deserialize(byteData, ObjectSchema(this.core.config.collection_format));

        await db.replace('atomicassets_collections', {
            contract: this.contractName,
            collection_name: data.collection_name,
            readable_name: deserializedData.name ? String(deserializedData.name).substr(0, 64) : null,
            author: data.author,
            allow_notify: data.allow_notify,
            authorized_accounts: data.authorized_accounts,
            notify_accounts: data.notify_accounts,
            market_fee: data.market_fee,
            data: JSON.stringify(deserializedData),
            created_at_block: block.block_num,
            created_at_time: eosioTimestampToDate(block.timestamp).getTime()
        }, ['contract', 'collection_name'], ['created_at_block', 'created_at_time']);
    }

    async handleOffersUpdate(
        db: ContractDBTransaction, block: ShipBlock, data: OffersTableRow, deleted: boolean
    ): Promise<void> {
        await saveOfferTableRow(db, block, this.contractName, data, deleted);

        this.core.checkOfferState([data.offer_id], []);
    }

    async handleTemplatesUpdate(
        db: ContractDBTransaction, block: ShipBlock, scope: string, data: TemplatesTableRow, deleted: boolean
    ): Promise<void> {
        if (deleted) {
            throw new Error('AtomicAssets: A template was deleted. Should not be possible by contract');
        }

        const schemaQuery = await db.query(
            'SELECT format FROM atomicassets_schemas WHERE contract = $1 AND collection_name = $2 AND schema_name = $3',
            [this.contractName, scope, data.schema_name]
        );

        if (schemaQuery.rowCount === 0) {
            throw new Error('AtomicAssets: Schema of template not found. Should not be possible by contract');
        }

        let byteData;
        if (typeof data.immutable_serialized_data === 'string') {
            byteData = Uint8Array.from(Buffer.from(data.immutable_serialized_data, 'hex'));
        } else {
            byteData = new Uint8Array(data.immutable_serialized_data);
        }

        const immutableData = deserialize(byteData, ObjectSchema(schemaQuery.rows[0].format));

        await db.replace('atomicassets_templates', {
            contract: this.contractName,
            template_id: data.template_id,
            collection_name: scope,
            schema_name: data.schema_name,
            readable_name: immutableData.name ? String(immutableData.name).substr(0, 64) : null,
            transferable: data.transferable,
            burnable: data.burnable,
            max_supply: data.max_supply,
            issued_supply: data.issued_supply,
            created_at_block: block.block_num,
            created_at_time: eosioTimestampToDate(block.timestamp).getTime()
        }, ['contract', 'template_id'], ['created_at_block', 'created_at_time']);

        await db.query(
            'DELETE FROM atomicassets_templates_data WHERE contract = $1 AND template_id = $2',
            [this.contractName, data.template_id]
        );

        const keys = Object.keys(immutableData);
        const values = [];

        for (const key of keys) {
            values.push({
                contract: this.contractName,
                template_id: data.template_id,
                key, value: JSON.stringify(immutableData[key])
            });
        }

        await db.insert('atomicassets_templates_data', values, ['contract', 'template_id', 'key']);
    }

    async handleSchemasUpdate(
        db: ContractDBTransaction, block: ShipBlock, scope: string, data: SchemasTableRow, deleted: boolean
    ): Promise<void> {
        if (deleted) {
            throw new Error('AtomicAssets: A schema was deleted. Should not be possible by contract');
        }

        await db.replace('atomicassets_schemas', {
            contract: this.contractName,
            collection_name: scope,
            schema_name: data.schema_name,
            format: data.format.map((element: any) => JSON.stringify(element)),
            created_at_block: block.block_num,
            created_at_time: eosioTimestampToDate(block.timestamp).getTime()
        }, ['contract', 'collection_name', 'schema_name'], ['created_at_block', 'created_at_time']);
    }

    async handleConfigUpdate(
        db: ContractDBTransaction, _: ShipBlock, data: ConfigTableRow, deleted: boolean
    ): Promise<void> {
        if (deleted) {
            throw new Error('AtomicAssets: The config was deleted. Should not be possible by contract');
        }

        if (this.core.config.supported_tokens.length !== data.supported_tokens.length) {
            const tokens = this.core.config.supported_tokens.map(row => row.sym);

            for (const token of data.supported_tokens) {
                const index = tokens.indexOf(token.sym);

                if (index === -1) {
                    await db.insert('atomicassets_tokens', {
                        contract: this.contractName,
                        token_symbol: token.sym.split(',')[1],
                        token_contract: token.contract,
                        token_precision: token.sym.split(',')[0]
                    }, ['contract', 'token_symbol']);
                } else {
                    tokens.splice(index, 1);
                }
            }
        }

        if (this.core.config.collection_format.length !== data.collection_format.length) {
            await db.update('atomicassets_config', {
                collection_format: data.collection_format.map((element: any) => JSON.stringify(element))
            }, {
                str: 'contract = $1',
                values: [this.contractName]
            }, ['contract']);
        }

        this.core.config = data;
    }

    async handleTokenconfigsUpdate(
        db: ContractDBTransaction, _: ShipBlock, data: TokenConfigsTableRow, deleted: boolean
    ): Promise<void> {
        if (deleted) {
            throw new Error('AtomicAssets: Tokenconfigs were deleted. Should not be possible by contract');
        }

        if (this.core.tokenconfigs.version !== data.version) {
            await db.update('atomicassets_config', {
                version: data.version
            }, {
                str: 'contract = $1',
                values: [this.contractName]
            }, ['contract']);
        }

        this.core.tokenconfigs = data;
    }
}
