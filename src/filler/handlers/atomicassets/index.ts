import * as fs from 'fs';
import { PoolClient } from 'pg';

import { ContractHandler } from '../interfaces';
import logger from '../../../utils/winston';
import { ConfigTableRow, TokenConfigsTableRow } from './types/tables';
import DataProcessor from '../../processor';
import ApiNotificationSender from '../../notifier';
import { assetProcessor } from './processors/assets';
import { balanceProcessor } from './processors/balances';
import { collectionProcessor } from './processors/collections';
import { configProcessor } from './processors/config';
import { logProcessor } from './processors/logs';
import { offerProcessor } from './processors/offers';
import { schemaProcessor } from './processors/schemas';
import { templateProcessor } from './processors/templates';
import Filler from '../../filler';

export enum OfferState {
    PENDING = 0,
    INVALID = 1,
    UNKNOWN = 2,
    ACCEPTED = 3,
    DECLINED = 4,
    CANCELLED = 5
}

export enum AtomicAssetsUpdatePriority {
    INDEPENDENT = 100,
    TABLE_BALANCES = 90,
    TABLE_CONFIG = 90,
    TABLE_COLLECTIONS = 80,
    TABLE_SCHEMAS = 80,
    TABLE_TEMPLATES = 60,
    ACTION_MINT_ASSET = 50,
    ACTION_UPDATE_ASSET = 40,
    ACTION_TRANSFER_ASSET = 40,
    ACTION_CREATE_OFFER = 20,
    ACTION_UPDATE_OFFER = 10,
    LOGS = 0
}

export type AtomicAssetsReaderArgs = {
    atomicassets_account: string,
    store_transfers: boolean,
    store_logs: boolean,
    collection_blacklist: string[]
};

export default class AtomicAssetsHandler extends ContractHandler {
    static handlerName = 'atomicassets';

    readonly args: AtomicAssetsReaderArgs;

    config: ConfigTableRow;
    tokenconfigs: TokenConfigsTableRow;

    constructor(filler: Filler, args: {[key: string]: any}) {
        super(filler, args);

        if (typeof args.atomicassets_account !== 'string') {
            throw new Error('AtomicAssets: Argument missing in atomicassets handler: atomicassets_account');
        }

        if (!Array.isArray(this.args.collection_blacklist)) {
            this.args.collection_blacklist = [];
        }

        if (!this.args.store_logs) {
            logger.warn('AtomicAssets: disabled store_logs');
        }

        if (!this.args.store_transfers) {
            logger.warn('AtomicAssets: disabled store_transfers');
        }
    }

    async init(client: PoolClient): Promise<void> {
        const existsQuery = await client.query(
            'SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2)',
            [await this.connection.database.schema(), 'atomicassets_config']
        );

        const materializedViews = ['atomicassets_asset_mints', 'atomicassets_asset_data'];
        const views = [
            'atomicassets_asset_mints_master', 'atomicassets_templates_master',
            'atomicassets_schemas_master', 'atomicassets_collections_master', 'atomicassets_offers_master',
            'atomicassets_transfers_master'
        ];

        if (!existsQuery.rows[0].exists) {
            logger.info('Could not find AtomicAssets tables. Create them now...');

            await client.query(fs.readFileSync('./definitions/tables/atomicassets_tables.sql', {
                encoding: 'utf8'
            }));

            for (const view of views) {
                await client.query(fs.readFileSync('./definitions/views/' + view + '.sql', {encoding: 'utf8'}));
            }

            for (const view of materializedViews) {
                await client.query(fs.readFileSync('./definitions/materialized/' + view + '.sql', {encoding: 'utf8'}));
            }

            await client.query(fs.readFileSync('./definitions/views/atomicassets_assets_master.sql', {encoding: 'utf8'}));

            logger.info('AtomicAssets tables successfully created');
        } else {
            for (const view of views) {
                await client.query(fs.readFileSync('./definitions/views/' + view + '.sql', {encoding: 'utf8'}));
            }
        }

        const configQuery = await client.query(
            'SELECT * FROM atomicassets_config WHERE contract = $1',
            [this.args.atomicassets_account]
        );

        if (configQuery.rows.length === 0) {
            const tokenconfigsTable = await this.connection.chain.rpc.get_table_rows({
                json: true, code: this.args.atomicassets_account,
                scope: this.args.atomicassets_account, table: 'tokenconfigs'
            });

            if (tokenconfigsTable.rows[0].standard !== 'atomicassets') {
                throw new Error('AtomicAssets: Contract not deployed on the account');
            }

            this.config = {
                supported_tokens: [],
                asset_counter: 0,
                offer_counter: 0,
                collection_format: []
            };

            this.tokenconfigs = {
                version: tokenconfigsTable.rows[0].version,
                standard: tokenconfigsTable.rows[0].standard
            };

            if (tokenconfigsTable.rows.length > 0) {
                await client.query(
                    'INSERT INTO atomicassets_config (contract, version, collection_format) VALUES ($1, $2, $3)',
                    [this.args.atomicassets_account, tokenconfigsTable.rows[0].version, []]
                );
            } else {
                throw new Error('AtomicAssets: Tokenconfigs table empty');
            }
        } else {
            const tokensQuery = await this.connection.database.query(
                'SELECT * FROM atomicassets_tokens WHERE contract = $1',
                [this.args.atomicassets_account]
            );

            this.config = {
                supported_tokens: tokensQuery.rows.map(row => ({
                    contract: row.token_contract,
                    sym: row.token_precision + ',' + row.token_symbol
                })),
                asset_counter: 0,
                offer_counter: 0,
                collection_format: configQuery.rows[0].collection_format
            };

            this.tokenconfigs = {
                version: configQuery.rows[0].version,
                standard: 'atomicassets'
            };
        }

        for (const view of materializedViews) {
            this.filler.registerMaterializedViewRefresh(view, 60000);
        }
    }

    async deleteDB(client: PoolClient): Promise<void> {
        const tables = [
            'atomicassets_assets', 'atomicassets_assets_backed_tokens', 'atomicassets_mints',
            'atomicassets_balances', 'atomicassets_collections', 'atomicassets_config',
            'atomicassets_offers', 'atomicassets_offers_assets',
            'atomicassets_templates', 'atomicassets_schemas',
            'atomicassets_tokens', 'atomicassets_transfers', 'atomicassets_transfers_assets'
        ];

        for (const table of tables) {
            await client.query(
                'DELETE FROM ' + client.escapeIdentifier(table) + ' WHERE contract = $1',
                [this.args.atomicassets_account]
            );
        }

        const views = ['atomicassets_asset_mints', 'atomicassets_asset_data'];

        for (const view of views) {
            await client.query('REFRESH MATERIALIZED VIEW ' + client.escapeIdentifier(view) + '');
        }
    }

    async register(processor: DataProcessor, notifier: ApiNotificationSender): Promise<() => any> {
        const destructors: Array<() => any> = [];

        destructors.push(assetProcessor(this, processor, notifier));
        destructors.push(balanceProcessor(this, processor));
        destructors.push(collectionProcessor(this, processor));
        destructors.push(configProcessor(this, processor));
        destructors.push(logProcessor(this, processor));
        destructors.push(offerProcessor(this, processor, notifier));
        destructors.push(schemaProcessor(this, processor));
        destructors.push(templateProcessor(this, processor));

        return (): any => destructors.map(fn => fn());
    }
}
