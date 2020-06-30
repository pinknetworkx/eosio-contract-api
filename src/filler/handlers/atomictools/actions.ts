import { Numeric } from 'eosjs/dist';

import { ContractDBTransaction } from '../../database';
import { ShipBlock } from '../../../types/ship';
import { EosioActionTrace, EosioTransaction } from '../../../types/eosio';
import logger from '../../../utils/winston';
import AtomicToolsHandler, { JobPriority, LinkState } from './index';
import { CancelLinkActionData, ClaimLinkActionData, LogLinkStart, LogNewLinkActionData } from './types/actions';
import { eosioTimestampToDate } from '../../../utils/eosio';

export default class AtomicToolsActionHandler {
    private readonly contractName: string;

    constructor(readonly core: AtomicToolsHandler) {
        this.contractName = this.core.args.atomictools_account;
    }

    async handleTrace(db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace, tx: EosioTransaction): Promise<void> {
        if (trace.act.account !== this.core.args.atomictools_account) {
            logger.error('AtomicTools: Received action from wrong contract: ' + trace.act.account);

            return;
        }

        if (typeof trace.act.data === 'string') {
            throw new Error('AtomicTools: Data of action could not be deserialized: ' + trace.act.name);
        }

        logger.debug('AtomicTools Action', trace.act);

        if (trace.act.name === 'lognewlink') {
            this.core.addUpdateJob(async () => {
                await this.lognewlink(db, block, <EosioActionTrace<LogNewLinkActionData>>trace, tx);
            }, JobPriority.ACTION_CREATE_LINK);
        } else if (trace.act.name === 'loglinkstart') {
            this.core.addUpdateJob(async () => {
                await this.loglinkstart(db, block, <EosioActionTrace<LogLinkStart>>trace);
            }, JobPriority.ACTION_UPDATE_LINK);
        } else if (trace.act.name === 'cancellink') {
            this.core.addUpdateJob(async () => {
                await this.cancellink(db, block, <EosioActionTrace<CancelLinkActionData>>trace);
            }, JobPriority.ACTION_UPDATE_LINK);
        } else if (trace.act.name === 'claimlink') {
            this.core.addUpdateJob(async () => {
                await this.claimlink(db, block, <EosioActionTrace<ClaimLinkActionData>>trace);
            }, JobPriority.ACTION_UPDATE_LINK);
        }
    }

    async lognewlink(
        db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace<LogNewLinkActionData>, tx: EosioTransaction
    ): Promise<void> {
        const key = Numeric.stringToPublicKey(trace.act.data.key);

        await db.insert('atomictools_links', {
            tools_contract: this.core.args.atomictools_account,
            link_id: trace.act.data.link_id,
            assets_contract: this.core.args.atomicassets_account,
            creator: trace.act.data.creator,
            claimer: null,
            state: LinkState.WAITING.valueOf(),
            key_type: key.type.valueOf(),
            key_data: key.data,
            memo: trace.act.data.memo.substr(0, 256),
            txid: Buffer.from(tx.id, 'hex'),
            created_at_block: block.block_num,
            created_at_time: eosioTimestampToDate(block.timestamp).getTime(),
            updated_at_block: block.block_num,
            updated_at_time: eosioTimestampToDate(block.timestamp).getTime()
        }, ['tools_contract', 'link_id']);

        const rows = trace.act.data.asset_ids.map((assetID) => ({
            tools_contract: this.core.args.atomictools_account,
            link_id: trace.act.data.link_id,
            assets_contract: this.core.args.atomicassets_account,
            asset_id: assetID
        }));

        await db.insert('atomictools_links_assets', rows, ['tools_contract', 'link_id', 'assets_contract', 'asset_id']);
    }

    async loglinkstart(
        db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace<LogLinkStart>
    ): Promise<void> {
        await db.update('atomictools_links', {
            state: LinkState.CREATED.valueOf(),
            updated_at_block: block.block_num,
            updated_at_time: eosioTimestampToDate(block.timestamp).getTime()
        }, {
            str: 'tools_contract = $1 AND link_id = $2',
            values: [this.core.args.atomictools_account, trace.act.data.link_id]
        }, ['tools_contract', 'link_id']);
    }

    async cancellink(
        db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace<CancelLinkActionData>
    ): Promise<void> {
        await db.update('atomictools_links', {
            state: LinkState.CANCELED.valueOf(),
            updated_at_block: block.block_num,
            updated_at_time: eosioTimestampToDate(block.timestamp).getTime()
        }, {
            str: 'tools_contract = $1 AND link_id = $2',
            values: [this.core.args.atomictools_account, trace.act.data.link_id]
        }, ['tools_contract', 'link_id']);
    }

    async claimlink(
        db: ContractDBTransaction, block: ShipBlock, trace: EosioActionTrace<ClaimLinkActionData>
    ): Promise<void> {
        await db.update('atomictools_links', {
            state: LinkState.CLAIMED.valueOf(),
            claimer: trace.act.data.claimer,
            updated_at_block: block.block_num,
            updated_at_time: eosioTimestampToDate(block.timestamp).getTime()
        }, {
            str: 'tools_contract = $1 AND link_id = $2',
            values: [this.core.args.atomictools_account, trace.act.data.link_id]
        }, ['tools_contract', 'link_id']);
    }
}
