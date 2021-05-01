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

export const ATOMICASSETS_BASE_PRIORITY = 0;

export enum OfferState {
    PENDING = 0,
    INVALID = 1,
    UNKNOWN = 2,
    ACCEPTED = 3,
    DECLINED = 4,
    CANCELLED = 5
}

export enum AtomicAssetsUpdatePriority {
    INDEPENDENT = ATOMICASSETS_BASE_PRIORITY + 10,
    TABLE_BALANCES = ATOMICASSETS_BASE_PRIORITY + 10,
    TABLE_CONFIG = ATOMICASSETS_BASE_PRIORITY + 10,
    TABLE_COLLECTIONS = ATOMICASSETS_BASE_PRIORITY + 20,
    TABLE_SCHEMAS = ATOMICASSETS_BASE_PRIORITY + 20,
    TABLE_TEMPLATES = ATOMICASSETS_BASE_PRIORITY + 40,
    ACTION_MINT_ASSET = ATOMICASSETS_BASE_PRIORITY + 50,
    ACTION_UPDATE_ASSET = ATOMICASSETS_BASE_PRIORITY + 60,
    ACTION_CREATE_OFFER = ATOMICASSETS_BASE_PRIORITY + 80,
    ACTION_UPDATE_OFFER = ATOMICASSETS_BASE_PRIORITY + 90,
    LOGS = 0
}

export type AtomicAssetsReaderArgs = {
    atomicassets_account: string,
    store_transfers: boolean,
    store_logs: boolean
};

export default class AtomicAssetsHandler extends ContractHandler {
    static handlerName = 'atomicassets';

    readonly args: AtomicAssetsReaderArgs;

    config: ConfigTableRow;
    tokenconfigs: TokenConfigsTableRow;

    static async setup(client: PoolClient): Promise<boolean> {
        const existsQuery = await client.query(
            'SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2)',
            ['public', 'atomicassets_config']
        );

        const materializedViews = ['atomicassets_asset_mints'];
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

            return true;
        }

        return false;
    }

    constructor(filler: Filler, args: {[key: string]: any}) {
        super(filler, args);

        if (typeof args.atomicassets_account !== 'string') {
            throw new Error('AtomicAssets: Argument missing in atomicassets handler: atomicassets_account');
        }

        if (!this.args.store_logs) {
            logger.warn('AtomicAssets: disabled store_logs');
        }

        if (!this.args.store_transfers) {
            logger.warn('AtomicAssets: disabled store_transfers');
        }
    }

    async init(client: PoolClient): Promise<void> {
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

        this.filler.registerMaterializedViewRefresh('atomicassets_asset_mints', 60000, true);

        (async (): Promise<any> => {
            // eslint-disable-next-line no-constant-condition
            while (true) {
                await new Promise(resolve => setTimeout(resolve, 30000));

                try {
                    await this.connection.database.query(`
                    WITH assets_to_update AS MATERIALIZED (
                        SELECT contract, asset_id, template_id
                        FROM atomicassets_assets
                        WHERE template_id IS NOT NULL AND template_mint IS NULL
                        ORDER BY template_id, asset_id
                        FOR UPDATE NOWAIT
                        LIMIT 100000
                    ), last_mint AS (
                        SELECT DISTINCT ON (template_id, contract) template_id, contract, template_mint
                        FROM atomicassets_assets assets
                        WHERE (template_id, contract) IN (SELECT DISTINCT template_id, contract FROM assets_to_update)
                            AND template_mint IS NOT NULL
                        ORDER BY template_id, contract, asset_id DESC
                    ), new_mints AS (
                        SELECT assets.contract, assets.asset_id, COALESCE(last_mint.template_mint, 0) + ROW_NUMBER() OVER (PARTITION BY assets.template_id, assets.contract ORDER BY asset_id) AS template_mint
                        FROM assets_to_update assets
                            LEFT OUTER JOIN last_mint ON (assets.template_id = last_mint.template_id AND assets.contract = last_mint.contract)
                    )
                    
                    UPDATE atomicassets_assets assets
                    SET template_mint = new_mints.template_mint
                    FROM new_mints
                    WHERE assets.asset_id = new_mints.asset_id AND assets.contract = new_mints.contract
                `);
                } catch (e) {
                    if (e.code === '55P03') {
                        logger.warn('Unable to acquire locks for updating asset mints');
                    } else {
                        throw e;
                    }
                }
            }
        })().then();
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

        const views = ['atomicassets_asset_mints'];

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
        destructors.push(offerProcessor(this, processor, notifier));
        destructors.push(schemaProcessor(this, processor));
        destructors.push(templateProcessor(this, processor));

        if (this.args.store_logs) {
            destructors.push(logProcessor(this, processor));
        }

        return (): any => destructors.map(fn => fn());
    }
}
