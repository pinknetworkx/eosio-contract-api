import * as fs from 'fs';
import PQueue from 'p-queue';
import { PoolClient } from 'pg';

import { ObjectSchema } from 'atomicassets';
import { ISchema } from 'atomicassets/build/Schema';

import { ContractHandler } from '../interfaces';
import { ShipBlock } from '../../../types/ship';
import { EosioActionTrace, EosioTableRow, EosioTransaction } from '../../../types/eosio';
import { ContractDBTransaction } from '../../database';
import logger from '../../../utils/winston';
import AtomicAssetsTableHandler from './tables';
import ConnectionManager from '../../../connections/manager';
import { PromiseEventHandler } from '../../../utils/event';
import AtomicAssetsActionHandler from './actions';
import { getStackTrace } from '../../../utils';

export enum OfferState {
    PENDING = 0,
    INVALID = 1,
    UNKNOWN = 2,
    ACCEPTED = 3,
    DECLINED = 4,
    CANCELLED = 5
}

export enum JobPriority {
    INDEPENDENT = 100,
    TABLE_BALANCES = 90,
    TABLE_CONFIG = 90,
    TABLE_TOKENCONFIGS = 90,
    TABLE_COLLECTIONS = 80,
    TABLE_SCHEMES = 80,
    TABLE_PRESETS = 60,
    TABLE_ASSETS = 60,
    ACTION_BURN_ASSET = 50,
    ACTION_TRANSFER_ASSET = 40,
    TABLE_OFFERS = 30,
    ACTION_CREATE_OFFER = 20,
    ACTION_UPDATE_OFFER = 10
}

export type AtomicAssetsReaderArgs = {
    atomicassets_account: string
};

export default class AtomicAssetsHandler extends ContractHandler {
    static handlerName = 'atomicassets';

    readonly args: AtomicAssetsReaderArgs;

    config: {
        version: string,
        collection_format?: ISchema
    };

    reversible = false;

    updateQueue: PQueue;
    updateJobs: any[] = [];

    offerState: {assets: string[], offers: string[]} = {assets: [], offers: []};

    notificationQueue: PQueue;
    notificationJobs: any[] = [];

    tableHandler: AtomicAssetsTableHandler;
    actionHandler: AtomicAssetsActionHandler;

    constructor(connection: ConnectionManager, events: PromiseEventHandler, args: {[key: string]: any}) {
        super(connection, events, args);

        if (typeof args.atomicassets_account !== 'string') {
            throw new Error('Argument missing in atomicassets handler: atomicassets_account');
        }

        this.updateQueue = new PQueue({concurrency: 1, autoStart: false});
        this.updateQueue.pause();

        this.notificationQueue = new PQueue({concurrency: 1, autoStart: false});
        this.notificationQueue.pause();

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

        this.config = {
            version: '0.0.0',
            collection_format: undefined
        };

        this.tableHandler = new AtomicAssetsTableHandler(this);
        this.actionHandler = new AtomicAssetsActionHandler(this);
    }

    async init(client: PoolClient): Promise<void> {
        const existsQuery = await client.query(
            'SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2)',
            [await this.connection.database.schema(), 'atomicassets_config']
        );

        if (!existsQuery.rows[0].exists) {
            logger.info('Could not find AtomicAssets tables. Create them now...');

            await client.query(fs.readFileSync('./definitions/tables/atomicassets_tables.sql', {
                encoding: 'utf8'
            }));

            logger.info('AtomicAssets tables successfully created');
        }

        const views = [
            'atomicassets_assets_master', 'atomicassets_templates_master', 'atomicassets_schemas_master',
            'atomicassets_collections_master', 'atomicassets_offers_master', 'atomicassets_transfers_master'
        ];

        for (const view of views) {
            await client.query(fs.readFileSync('./definitions/views/' + view + '.sql', {encoding: 'utf8'}));
        }

        const configQuery = await client.query(
            'SELECT * FROM atomicassets_config WHERE contract = $1',
            [this.args.atomicassets_account]
        );

        if (configQuery === null || configQuery.rows.length === 0) {
            const configTable = await this.connection.chain.rpc.get_table_rows({
                json: true, code: this.args.atomicassets_account,
                scope: this.args.atomicassets_account, table: 'config'
            });

            const tokenTable = await this.connection.chain.rpc.get_table_rows({
                json: true, code: this.args.atomicassets_account,
                scope: this.args.atomicassets_account, table: 'tokenconfigs'
            });

            if (configTable.rows.length > 0 && tokenTable.rows.length > 0 && tokenTable.rows[0].standard === 'atomicassets') {
                await client.query(
                    'INSERT INTO atomicassets_config (contract, version, collection_format) VALUES ($1, $2, $3)',
                    [
                        this.args.atomicassets_account,
                        tokenTable.rows[0].version,
                        configTable.rows[0].collection_format.map((element: any) => JSON.stringify(element))
                    ]
                );

                this.config.collection_format = ObjectSchema(configTable.rows[0].collection_format);
                this.config.version = tokenTable.rows[0].version;
            } else {
                throw new Error('Unable to fetch atomicassets version');
            }
        } else {
            this.config.collection_format = ObjectSchema(configQuery.rows[0].collection_format);
            this.config.version = configQuery.rows[0].version;
        }

        this.events.on('atomicassets_offer_state_change', async ({contract, offer_id, state}: {
            db: ContractDBTransaction, block: ShipBlock, contract: string, offer_id: string, state: number
        }) => {
            if (contract !== this.args.atomicassets_account) {
                return;
            }

            logger.debug('Offer #' + offer_id + ' changed state to ' + state);
        });
    }

    async deleteDB(client: PoolClient): Promise<void> {
        const tables = [
            'atomicassets_assets', 'atomicassets_assets_backed_tokens', 'atomicassets_assets_data',
            'atomicassets_balances', 'atomicassets_collections', 'atomicassets_config',
            'atomicassets_logs', 'atomicassets_offers', 'atomicassets_offers_assets',
            'atomicassets_templates', 'atomicassets_templates_data', 'atomicassets_schemas',
            'atomicassets_token_symbols', 'atomicassets_transfers', 'atomicassets_transfers_assets'
        ];

        for (const table of tables) {
            await client.query(
                'DELETE FROM ' + client.escapeIdentifier(table) + ' WHERE contract = $1',
                [this.args.atomicassets_account]
            );
        }
    }

    async onAction(db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace, tx: EosioTransaction): Promise<void> {
        await this.actionHandler.handleTrace(db, block, trace, tx);
    }

    async onTableChange(db: ContractDBTransaction, block: ShipBlock, delta: EosioTableRow): Promise<void> {
        await this.tableHandler.handleUpdate(db, block, delta);
    }

    async onBlockComplete(db: ContractDBTransaction, block: ShipBlock): Promise<void> {
        this.reversible = db.currentBlock > db.lastIrreversibleBlock;

        this.updateQueue.start();
        await Promise.all(this.updateJobs);
        this.updateQueue.pause();
        this.updateJobs = [];

        await this.updateOfferStates(db, block, this.offerState.offers, this.offerState.assets);
        this.offerState.offers = [];
        this.offerState.assets = [];
    }

    async onCommit(): Promise<void> {
        this.notificationQueue.start();
        await Promise.all(this.notificationJobs);
        this.notificationQueue.pause();
        this.notificationJobs = [];
    }

    checkOfferState(offerIDs: string[], assetIDs: string[]): void {
        for (const offerID of offerIDs) {
            if (this.offerState.offers.indexOf(offerID) >= 0) {
                continue;
            }

            this.offerState.offers.push(offerID);
        }

        for (const assetID of assetIDs) {
            if (this.offerState.assets.indexOf(assetID) >= 0) {
                continue;
            }

            this.offerState.assets.push(assetID);
        }
    }

    async updateOfferStates(db: ContractDBTransaction, block: ShipBlock, offerIDs: string[], assetIDs: string[]): Promise<void> {
        if (offerIDs.length === 0 && assetIDs.length === 0) {
            return;
        }

        const filterOptions = [];

        if (offerIDs.length > 0) {
            filterOptions.push('(offer.offer_id IN (' + offerIDs.join(',') + '))');
        }

        if (assetIDs.length > 0) {
            filterOptions.push('(asset.asset_id IN (' + assetIDs.join(',') + '))');
        }

        const relatedOffersQuery = await db.query(
            'SELECT DISTINCT ON (offer.offer_id) offer.offer_id, offer.state ' +
            'FROM atomicassets_offers offer, atomicassets_offers_assets asset ' +
            'WHERE offer.contract = asset.contract AND offer.offer_id = asset.offer_id AND ' +
            'offer.state IN (' + [OfferState.PENDING.valueOf(), OfferState.INVALID.valueOf()].join(',') + ') AND' +
            '(' + filterOptions.join(' OR ') + ') AND offer.contract = \'' + this.args.atomicassets_account + '\''
        );

        if (relatedOffersQuery.rowCount === 0) {
            return;
        }

        const invalidOffersQuery = await db.query(
            'SELECT DISTINCT ON (o_asset.offer_id) o_asset.offer_id ' +
            'FROM atomicassets_offers_assets o_asset, atomicassets_assets a_asset ' +
            'WHERE o_asset.contract = a_asset.contract AND o_asset.asset_id = a_asset.asset_id AND ' +
            'o_asset.offer_id IN (' + relatedOffersQuery.rows.map(row => row.offer_id).join(',') + ') AND ' +
            'o_asset.owner != a_asset.owner AND o_asset.contract = \'' + this.args.atomicassets_account + '\''
        );

        const invalidOffers = invalidOffersQuery.rows.map((row) => row.offer_id);
        const notifications: Array<{offer_id: string, state: number}> = [];

        if (invalidOffers.length > 0) {
            await db.update('atomicassets_offers', {
                state: OfferState.INVALID.valueOf()
            }, {
                str: 'contract = $1 AND offer_id IN (' + invalidOffers.join(',') + ') AND state = $2',
                values: [this.args.atomicassets_account, OfferState.PENDING.valueOf()]
            }, ['contract', 'offer_id', 'asset_id']);
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

    addUpdateJob(fn: () => any, priority: number): void {
        const trace = getStackTrace();

        this.updateJobs.push(this.updateQueue.add(async () => {
            try {
                await fn();
            } catch (e) {
                logger.error(trace);
                throw e;
            }
        }, {priority}));
    }

    pushNotificiation(block: ShipBlock, tx: EosioTransaction | null, prefix: string, name: string, data: any): void {
        if (!this.reversible) {
            return;
        }

        const trace = getStackTrace();

        this.notificationJobs.push(this.notificationQueue.add(async () => {
            try {
                const channelName = [
                    'eosio-contract-api', this.connection.chain.name, 'atomicassets',
                    this.args.atomicassets_account, prefix
                ].join(':');

                await this.connection.redis.ioRedis.publish(channelName, JSON.stringify({
                    transaction: tx,
                    block: {block_num: block.block_num, block_id: block.block_id},
                    action: name, data
                }));
            } catch (e) {
                logger.warn('Error while pushing notification', trace);
            }
        }));
    }
}
