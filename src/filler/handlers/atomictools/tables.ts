import { Numeric } from 'eosjs/dist';

import { ContractDBTransaction } from '../../database';
import { ShipBlock } from '../../../types/ship';
import { EosioTableRow } from '../../../types/eosio';
import logger from '../../../utils/winston';
import AtomicToolsHandler, { JobPriority, LinkState } from './index';
import { ConfigTableRow, LinksTableRow } from './types/tables';
import { eosioTimestampToDate } from '../../../utils/eosio';

export default class AtomicToolsTableHandler {
    private readonly contractName: string;

    constructor(readonly core: AtomicToolsHandler) {
        this.contractName = this.core.args.atomictools_account;
    }

    async handleUpdate(db: ContractDBTransaction, block: ShipBlock, delta: EosioTableRow): Promise<void> {
        if (typeof delta.value === 'string') {
            throw new Error('AtomicTools: Delta of table could not be deserialized: ' + delta.table);
        }

        if (delta.code !== this.core.args.atomictools_account) {
            logger.error('AtomicTools: Received table delta from wrong contract: ' + delta.code);

            return;
        }

        logger.debug('AtomicTools Delta', delta);

        if (delta.table === 'links' && delta.scope === this.core.args.atomictools_account) {
            this.core.addUpdateJob(async () => {
                // @ts-ignore
                await this.handleLinksUpdate(db, block, delta.value, !delta.present);
            }, JobPriority.TABLE_LINKS);
        } else if (delta.table === 'config' && delta.scope === this.core.args.atomictools_account) {
            this.core.addUpdateJob(async () => {
                // @ts-ignore
                await this.handleConfigUpdate(db, block, delta.value, !delta.present);
            }, JobPriority.TABLE_CONFIG);
        }
    }

    async handleLinksUpdate(
        db: ContractDBTransaction, block: ShipBlock, data: LinksTableRow, deleted: boolean
    ): Promise<void> {
        if (deleted) {
            return;
        }

        const key = Numeric.stringToPublicKey(data.key);

        await db.replace('atomictools_links', {
            tools_contract: this.core.args.atomictools_account,
            link_id: data.link_id,
            asset_contract: this.core.args.atomicassets_account,
            creator: data.creator,
            claimer: null,
            state: data.assets_transferred ? LinkState.CREATED.valueOf() : LinkState.WAITING.valueOf(),
            key_type: key.type.valueOf(),
            key_data: key.data,
            txid: null,
            memo: data.memo.substr(0, 256),
            created_at_block: block.block_num,
            created_at_time: eosioTimestampToDate(block.timestamp).getTime()
        }, ['tools_contract', 'link_id'], [
            'claimer', 'created_at_block', 'created_at_time', 'txid'
        ]);

        const assets = await db.query(
            'SELECT COUNT(*) FROM atomictools_links_assets WHERE tools_contract = $1 AND link_id = $2',
            [this.core.args.atomictools_account, data.link_id]
        );

        if (assets.rows[0].count === 0) {
            const rows = data.asset_ids.map(row => ({
                tools_contract: this.core.args.atomictools_account,
                link_id: data.link_id,
                asset_contract: this.core.args.atomicassets_account,
                asset_id: row
            }));

            await db.insert('atomictools_links_assets', rows, [
                'tools_contract', 'link_id', 'asset_contract', 'asset_id'
            ]);
        }
    }

    async handleConfigUpdate(
        db: ContractDBTransaction, block: ShipBlock, data: ConfigTableRow, deleted: boolean
    ): Promise<void> {
        if (deleted) {
            throw new Error('AtomicTools: Config should not be deleted');
        }

        if (this.core.config.version !== data.version) {
            await db.update('atomictools_config', {
                version: data.version
            }, {
                str: 'tools_contract = $1',
                values: [this.core.args.atomictools_account]
            }, ['tools_contract']);
        }

        this.core.config = data;
    }
}
