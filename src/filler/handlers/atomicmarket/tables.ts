import AtomicMarketHandler, { JobPriority } from './index';
import { ContractDBTransaction } from '../../database';
import { ShipBlock } from '../../../types/ship';
import { EosioTableRow } from '../../../types/eosio';
import logger from '../../../utils/winston';
import { AuctionsTableRow, BalancesTableRow, ConfigTableRow, MarketplacesTableRow, SalesTableRow } from './types/tables';

export default class AtomicMarketTableHandler {
    private readonly contractName: string;

    constructor(readonly core: AtomicMarketHandler) {
        this.contractName = this.core.args.atomicassets_account;
    }

    async handleUpdate(db: ContractDBTransaction, block: ShipBlock, delta: EosioTableRow): Promise<void> {
        if (typeof delta.value === 'string') {
            throw new Error('AtomicMarket: Delta of atomicmarket table could not be deserialized: ' + delta.table);
        }

        if (delta.code !== this.core.args.atomicmarket_account) {
            logger.error('[atomicmarket] Received table delta from wrong contract: ' + delta.code);

            return;
        }

        logger.debug('AtomicMarket Delta', delta);

        if (delta.table === 'sales' && delta.scope === this.core.args.atomicmarket_account) {
            this.core.addUpdateJob(async () => {
                // @ts-ignore
                await this.handleSalesUpdate(db, block, delta.scope, delta.value, !delta.present);
            }, JobPriority.TABLE_SALES);
        } else if (delta.table === 'auctions' && delta.scope === this.core.args.atomicmarket_account) {
            this.core.addUpdateJob(async () => {
                // @ts-ignore
                await this.handleAuctionsUpdate(db, block, delta.value, !delta.present);
            }, JobPriority.TABLE_AUCTIONS);
        } else if (delta.table === 'balances' && delta.scope === this.core.args.atomicmarket_account) {
            this.core.addUpdateJob(async () => {
                // @ts-ignore
                await this.handleBalancesUpdate(db, block, delta.value, !delta.present);
            }, JobPriority.TABLE_BALANCES);
        } else if (delta.table === 'marketplaces' && delta.scope === this.core.args.atomicmarket_account) {
            this.core.addUpdateJob(async () => {
                // @ts-ignore
                await this.handleMarketplacesUpdate(db, block, delta.value, !delta.present);
            }, JobPriority.TABLE_MARKETPLACES);
        } else if (delta.table === 'config' && delta.scope === this.core.args.atomicmarket_account) {
            this.core.addUpdateJob(async () => {
                // @ts-ignore
                await this.handleConfigUpdate(db, block, delta.scope, delta.value, !delta.present);
            }, JobPriority.TABLE_CONFIG);
        }
    }

    async handleSalesUpdate(
        db: ContractDBTransaction, block: ShipBlock, data: SalesTableRow, deleted: boolean
    ): Promise<void> {

    }

    async handleAuctionsUpdate(
        db: ContractDBTransaction, block: ShipBlock, data: AuctionsTableRow, deleted: boolean
    ): Promise<void> {

    }

    async handleBalancesUpdate(
        db: ContractDBTransaction, block: ShipBlock, data: BalancesTableRow, deleted: boolean
    ): Promise<void> {

    }

    async handleConfigUpdate(
        db: ContractDBTransaction, block: ShipBlock, data: ConfigTableRow, deleted: boolean
    ): Promise<void> {

    }

    async handleMarketplacesUpdate(
        db: ContractDBTransaction, block: ShipBlock, data: MarketplacesTableRow, deleted: boolean
    ): Promise<void> {

    }
}
