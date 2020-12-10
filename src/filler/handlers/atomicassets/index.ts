import * as fs from 'fs';
import { PoolClient } from 'pg';

import { ContractHandler } from '../interfaces';
import { ShipBlock } from '../../../types/ship';
import { EosioActionTrace, EosioTableRow, EosioTransaction } from '../../../types/eosio';
import { ContractDBTransaction } from '../../database';
import logger from '../../../utils/winston';
import AtomicAssetsTableHandler from './tables';
import AtomicAssetsActionHandler from './actions';
import { getStackTrace } from '../../../utils';
import { AssetsTableRow, ConfigTableRow, TokenConfigsTableRow } from './types/tables';
import StateReceiver from '../../receiver';

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
    TABLE_TOKENCONFIGS = 90,
    TABLE_COLLECTIONS = 80,
    TABLE_SCHEMES = 80,
    TABLE_PRESETS = 60,
    TABLE_ASSETS = 60,
    ACTION_BURN_ASSET = 50,
    ACTION_MINT_ASSET = 40,
    ACTION_TRANSFER_ASSET = 40,
    TABLE_OFFERS = 30,
    ACTION_CREATE_OFFER = 20,
    ACTION_UPDATE_OFFER = 10
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

    notifications: Array<{
        index: number,
        trace: any,
        fn: () => any
    }> = [];
    jobs: Array<{
        priority: number,
        index: number,
        trace: any,
        fn: () => any
    }> = [];

    blockOffers: {assets: string[], offers: string[]} = {assets: [], offers: []};
    blockAssets: {[key: string]: {scope: string, row: AssetsTableRow}};

    tableHandler: AtomicAssetsTableHandler;
    actionHandler: AtomicAssetsActionHandler;

    materializedViewRefresh = true;

    constructor(reader: StateReceiver, args: {[key: string]: any}, minBlock: number = 0) {
        super(reader, args, minBlock);

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

        this.scope = {
            actions: [
                {
                    filter: this.args.atomicassets_account + ':*',
                    deserialize: true
                }
            ],
            tables: [
                {
                    filter: this.args.atomicassets_account + ':*',
                    deserialize: true
                }
            ]
        };

        this.tableHandler = new AtomicAssetsTableHandler(this);
        this.actionHandler = new AtomicAssetsActionHandler(this);
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

        this.events.on('atomicassets_offer_state_change', async ({contract, offer_id, state}: {
            db: ContractDBTransaction, block: ShipBlock, contract: string, offer_id: string, state: number
        }) => {
            if (contract !== this.args.atomicassets_account) {
                return;
            }

            logger.debug('Offer #' + offer_id + ' changed state to ' + state);
        });

        setTimeout(async () => {
            while (this.materializedViewRefresh) {
                try {
                    for (const view of materializedViews) {
                        const key = 'eosio-contract-api:' + this.connection.chain.name + ':' + this.connection.database.name + ':' + view;

                        const updated = JSON.parse(await this.connection.redis.ioRedis.get(key)) || 0;

                        // only update every 50 seconds if multiple processes are running
                        if (updated < Date.now() - 50000) {
                            await this.connection.database.query('REFRESH MATERIALIZED VIEW CONCURRENTLY ' + view);

                            await this.connection.redis.ioRedis.set(key, JSON.stringify(Date.now()));
                        }
                    }
                } catch (e) {
                    logger.error(e);
                }

                await new Promise((resolve => setTimeout(resolve, 60000)));
            }
        }, 5000);
    }

    async deleteDB(client: PoolClient): Promise<void> {
        const tables = [
            'atomicassets_assets', 'atomicassets_assets_backed_tokens',
            'atomicassets_balances', 'atomicassets_collections', 'atomicassets_config',
            'atomicassets_logs', 'atomicassets_offers', 'atomicassets_offers_assets',
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

    async onAction(db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace, tx: EosioTransaction): Promise<void> {
        await this.actionHandler.handleTrace(db, block, trace, tx);
    }

    async onTableChange(db: ContractDBTransaction, block: ShipBlock, delta: EosioTableRow): Promise<void> {
        await this.tableHandler.handleUpdate(db, block, delta);
    }

    async onBlockStart(): Promise<void> {
        this.jobs = [];
        this.notifications = [];

        this.blockOffers.offers = [];
        this.blockOffers.assets = [];
    }

    async onBlockComplete(db: ContractDBTransaction, block: ShipBlock): Promise<void> {
        this.jobs.sort((a, b) => {
            if (a.priority === b.priority) {
                return a.index - b.index;
            }

            return b.priority - a.priority;
        });

        for (const job of this.jobs) {
            try {
                await job.fn();
            } catch (e) {
                logger.error('Error while processing update job', job.trace);

                throw e;
            }
        }

        this.jobs = [];

        await this.updateOfferStates(db, block, this.blockOffers.offers, this.blockOffers.assets);
    }

    async onCommit(): Promise<void> {
        for (const notification of this.notifications) {
            try {
                await notification.fn();
            } catch (e) {
                logger.warn('Error while pushing notification', e);
            }
        }

        this.notifications = [];
    }

    cacheAssetUpdate(owner: string, row: AssetsTableRow): void {
        this.blockAssets[String(row.asset_id)] = {row, scope: owner};
    }

    queueOfferStateCheck(offerIDs: string[], assetIDs: string[]): void {
        for (const offerID of offerIDs) {
            if (this.blockOffers.offers.indexOf(offerID) >= 0) {
                continue;
            }

            this.blockOffers.offers.push(offerID);
        }

        for (const assetID of assetIDs) {
            if (this.blockOffers.assets.indexOf(assetID) >= 0) {
                continue;
            }

            this.blockOffers.assets.push(assetID);
        }
    }

    async updateOfferStates(db: ContractDBTransaction, block: ShipBlock, offerIDs: string[], assetIDs: string[]): Promise<void> {
        if (offerIDs.length === 0 && assetIDs.length === 0) {
            return;
        }

        const filterOptions = [
            '(offer.offer_id = ANY ($2))',
            '(asset.asset_id = ANY ($3))'
        ];

        const relatedOffersQuery = await db.query(
            'SELECT DISTINCT ON (offer.offer_id) offer.offer_id, offer.state ' +
            'FROM atomicassets_offers offer, atomicassets_offers_assets asset ' +
            'WHERE offer.contract = asset.contract AND offer.offer_id = asset.offer_id AND ' +
            'offer.state IN (' + [OfferState.PENDING.valueOf(), OfferState.INVALID.valueOf()].join(',') + ') AND' +
            '(' + filterOptions.join(' OR ') + ') AND offer.contract = $1',
            [this.args.atomicassets_account, offerIDs, assetIDs]
        );

        if (relatedOffersQuery.rowCount === 0) {
            return;
        }

        const invalidOffersQuery = await db.query(
            'SELECT DISTINCT ON (o_asset.offer_id) o_asset.offer_id ' +
            'FROM atomicassets_offers_assets o_asset, atomicassets_assets a_asset ' +
            'WHERE o_asset.contract = a_asset.contract AND o_asset.asset_id = a_asset.asset_id AND ' +
            'o_asset.offer_id = ANY ($2) AND ' +
            '(o_asset.owner != a_asset.owner OR a_asset.owner IS NULL) AND o_asset.contract = $1',
            [this.args.atomicassets_account, relatedOffersQuery.rows.map(row => row.offer_id)]
        );

        const invalidOffers = invalidOffersQuery.rows.map((row) => row.offer_id);
        const notifications: Array<{offer_id: string, state: number}> = [];

        if (invalidOffers.length > 0) {
            await db.update('atomicassets_offers', {
                state: OfferState.INVALID.valueOf()
            }, {
                str: 'contract = $1 AND offer_id IN (' + invalidOffers.join(',') + ') AND state = $2',
                values: [this.args.atomicassets_account, OfferState.PENDING.valueOf()]
            }, ['contract', 'offer_id']);
        }

        for (const row of relatedOffersQuery.rows) {
            if (invalidOffers.indexOf(row.offer_id) >= 0) {
                if (row.state === OfferState.PENDING.valueOf()) {
                    notifications.push({
                        offer_id: row.offer_id,
                        state: OfferState.INVALID.valueOf()
                    });
                }
            } else if (row.state === OfferState.INVALID.valueOf()) {
                await db.update('atomicassets_offers', {
                    state: OfferState.PENDING.valueOf()
                }, {
                    str: 'contract = $1 AND offer_id = $2',
                    values: [this.args.atomicassets_account, row.offer_id]
                }, ['contract', 'offer_od']);

                notifications.push({
                    offer_id: row.offer_id,
                    state: OfferState.PENDING.valueOf()
                });
            }
        }

        for (const notification of notifications) {
            this.pushNotificiation(block, null, 'offers', 'state_change', notification);

            await this.events.emit('atomicassets_offer_state_change',
                {db, block, contract: this.args.atomicassets_account, ...notification});
        }
    }

    addUpdateJob(fn: () => any, priority: AtomicAssetsUpdatePriority): void {
        this.jobs.push({
            priority: priority.valueOf(),
            index: this.jobs.length,
            trace: getStackTrace(),
            fn: fn
        });
    }

    pushNotificiation(block: ShipBlock, tx: EosioTransaction | null, prefix: string, name: string, data: any): void {
        if (block.block_num < block.last_irreversible.block_num) {
            return;
        }

        this.notifications.push({
            index: this.notifications.length,
            trace: getStackTrace(),
            fn: async () => {
                const channelName = [
                    'eosio-contract-api', this.connection.chain.name, this.reader.name,
                    'atomicassets', this.args.atomicassets_account, prefix
                ].join(':');

                await this.connection.redis.ioRedis.publish(channelName, JSON.stringify({
                    transaction: tx,
                    block: {block_num: block.block_num, block_id: block.block_id},
                    action: name, data: data
                }));
            }
        });
    }
}
