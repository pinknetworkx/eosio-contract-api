import DataProcessor from '../../../processor';
import {ContractDBTransaction} from '../../../database';
import {EosioActionTrace, EosioTransaction} from '../../../../types/eosio';
import {ShipBlock} from '../../../../types/ship';
import {eosioTimestampToDate} from '../../../../utils/eosio';
import NeftyDropsHandler, {DropState, NeftyDropsUpdatePriority} from '../index';
import {
  ClaimDropActionData,
  EraseDropActionData, LogClaimActionData,
  LogCreateDropActionData,
  SetDropAuthActionData,
  SetDropDataActionData,
  SetDropHiddenActionData,
  SetDropLimitActionData,
  SetDropMaxActionData,
  SetDropPriceActionData,
  SetDropTimesActionData
} from '../types/actions';
import {preventInt64Overflow} from '../../../../utils/binary';
import logger from '../../../../utils/winston';

export function dropsProcessor(core: NeftyDropsHandler, processor: DataProcessor): () => any {
  const destructors: Array<() => any> = [];
  const contract = core.args.neftydrops_account;

  destructors.push(processor.onActionTrace(
      contract, 'lognewdrop',
      async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<LogCreateDropActionData>): Promise<void> => {
        await db.insert('neftydrops_drops', {
          drops_contract: core.args.neftydrops_account,
          assets_contract: core.args.atomicassets_account,
          drop_id: trace.act.data.drop_id,
          collection_name: trace.act.data.collection_name,
          listing_price: preventInt64Overflow(trace.act.data.listing_price.split(' ')[0].replace('.', '')),
          listing_symbol: trace.act.data.listing_price.split(' ')[1],
          settlement_symbol: trace.act.data.settlement_symbol.split(',')[1],
          price_recipient: trace.act.data.price_recipient,
          auth_required: trace.act.data.auth_required,
          preminted: trace.act.data.assets_to_mint.some(asset => asset.use_pool),
          account_limit: trace.act.data.account_limit,
          account_limit_cooldown: trace.act.data.account_limit_cooldown,
          max_claimable: trace.act.data.max_claimable,
          start_time: trace.act.data.start_time,
          end_time: trace.act.data.end_time,
          display_data: trace.act.data.display_data,
          state: trace.act.data.is_hidden ? DropState.HIDDEN.valueOf() : DropState.ACTIVE.valueOf(),
          updated_at_block: block.block_num,
          updated_at_time: eosioTimestampToDate(block.timestamp).getTime(),
          created_at_block: block.block_num,
          created_at_time: eosioTimestampToDate(block.timestamp).getTime(),
          current_claimed: 0,
        }, ['drops_contract', 'drop_id']);

        await db.insert('neftydrops_drop_assets', [
          ...trace.act.data.assets_to_mint.map((asset, index) => ({
            drops_contract: contract,
            assets_contract: core.args.atomicassets_account,
            drop_id: trace.act.data.drop_id,
            collection_name: trace.act.data.collection_name,
            template_id: asset.template_id,
            use_pool: asset.use_pool,
            tokens_to_back: asset.tokens_to_back,
            index: index + 1,
          })),
        ], ['drops_contract', 'drop_id', 'index']);

      }, NeftyDropsUpdatePriority.ACTION_CREATE_DROP.valueOf()
  ));

  destructors.push(processor.onActionTrace(
      contract, 'setdropauth',
      async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<SetDropAuthActionData>): Promise<void> => {
        await db.update('neftydrops_drops', {
          auth_required: trace.act.data.auth_required,
          updated_at_block: block.block_num,
          updated_at_time: eosioTimestampToDate(block.timestamp).getTime()
        }, {
          str: 'drops_contract = $1 AND drop_id = $2',
          values: [core.args.neftydrops_account, trace.act.data.drop_id]
        }, ['drops_contract', 'drop_id']);
      }, NeftyDropsUpdatePriority.ACTION_UPDATE_DROP.valueOf()
  ));

  destructors.push(processor.onActionTrace(
      contract, 'setdropdata',
      async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<SetDropDataActionData>): Promise<void> => {
        await db.update('neftydrops_drops', {
          display_data: trace.act.data.display_data,
          updated_at_block: block.block_num,
          updated_at_time: eosioTimestampToDate(block.timestamp).getTime()
        }, {
          str: 'drops_contract = $1 AND drop_id = $2',
          values: [core.args.neftydrops_account, trace.act.data.drop_id]
        }, ['drops_contract', 'drop_id']);
      }, NeftyDropsUpdatePriority.ACTION_UPDATE_DROP.valueOf()
  ));

  destructors.push(processor.onActionTrace(
      contract, 'setdroplimit',
      async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<SetDropLimitActionData>): Promise<void> => {
        await db.update('neftydrops_drops', {
          account_limit: trace.act.data.account_limit,
          account_limit_cooldown: trace.act.data.account_limit_cooldown,
          updated_at_block: block.block_num,
          updated_at_time: eosioTimestampToDate(block.timestamp).getTime()
        }, {
          str: 'drops_contract = $1 AND drop_id = $2',
          values: [core.args.neftydrops_account, trace.act.data.drop_id]
        }, ['drops_contract', 'drop_id']);
      }, NeftyDropsUpdatePriority.ACTION_UPDATE_DROP.valueOf()
  ));

  destructors.push(processor.onActionTrace(
      contract, 'setdropmax',
      async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<SetDropMaxActionData>): Promise<void> => {
        await db.update('neftydrops_drops', {
          max_claimable: trace.act.data.new_max_claimable,
          updated_at_block: block.block_num,
          updated_at_time: eosioTimestampToDate(block.timestamp).getTime()
        }, {
          str: 'drops_contract = $1 AND drop_id = $2',
          values: [core.args.neftydrops_account, trace.act.data.drop_id]
        }, ['drops_contract', 'drop_id']);
      }, NeftyDropsUpdatePriority.ACTION_UPDATE_DROP.valueOf()
  ));

  destructors.push(processor.onActionTrace(
      contract, 'setdrophiddn',
      async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<SetDropHiddenActionData>): Promise<void> => {
        await db.update('neftydrops_drops', {
          state: trace.act.data.is_hidden === true ? DropState.HIDDEN.valueOf() : DropState.ACTIVE.valueOf(),
          updated_at_block: block.block_num,
          updated_at_time: eosioTimestampToDate(block.timestamp).getTime()
        }, {
          str: 'drops_contract = $1 AND drop_id = $2',
          values: [core.args.neftydrops_account, trace.act.data.drop_id]
        }, ['drops_contract', 'drop_id']);
      }, NeftyDropsUpdatePriority.ACTION_UPDATE_DROP.valueOf()
  ));

  destructors.push(processor.onActionTrace(
      contract, 'setdropprice',
      async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<SetDropPriceActionData>): Promise<void> => {
        await db.update('neftydrops_drops', {
          listing_price: preventInt64Overflow(trace.act.data.listing_price.split(' ')[0].replace('.', '')),
          listing_symbol: trace.act.data.listing_price.split(' ')[1],
          settlement_symbol: trace.act.data.settlement_symbol.split(',')[1],
          updated_at_block: block.block_num,
          updated_at_time: eosioTimestampToDate(block.timestamp).getTime()
        }, {
          str: 'drops_contract = $1 AND drop_id = $2',
          values: [core.args.neftydrops_account, trace.act.data.drop_id]
        }, ['drops_contract', 'drop_id']);
      }, NeftyDropsUpdatePriority.ACTION_UPDATE_DROP.valueOf()
  ));

  destructors.push(processor.onActionTrace(
      contract, 'setdroptimes',
      async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<SetDropTimesActionData>): Promise<void> => {
        await db.update('neftydrops_drops', {
          start_time: trace.act.data.start_time,
          end_time: trace.act.data.end_time,
          updated_at_block: block.block_num,
          updated_at_time: eosioTimestampToDate(block.timestamp).getTime()
        }, {
          str: 'drops_contract = $1 AND drop_id = $2',
          values: [core.args.neftydrops_account, trace.act.data.drop_id]
        }, ['drops_contract', 'drop_id']);
      }, NeftyDropsUpdatePriority.ACTION_UPDATE_DROP.valueOf()
  ));

  destructors.push(processor.onActionTrace(
      contract, 'erasedrop',
      async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<EraseDropActionData>): Promise<void> => {
        try {
          await db.update('neftydrops_drops', {
            state: DropState.DELETED.valueOf(),
            updated_at_block: block.block_num,
            updated_at_time: eosioTimestampToDate(block.timestamp).getTime()
          }, {
            str: 'drops_contract = $1 AND drop_id = $2',
            values: [core.args.neftydrops_account, trace.act.data.drop_id]
          }, ['drops_contract', 'drop_id']);
        } catch (error) {
          logger.warn('NeftyDrops: Unable to delete drop because it does not exist');
        }
      }, NeftyDropsUpdatePriority.ACTION_UPDATE_DROP.valueOf()
  ));

  destructors.push(processor.onActionTrace(
      contract, 'logclaim',
      async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<LogClaimActionData>): Promise<void> => {
        const claimAction = tx.traces.find(trace => trace.act.account === core.args.neftydrops_account && trace.act.name.startsWith('claim'));
        const claimId = claimAction.global_sequence;

        const [amountSpent, spentSymbol] = trace.act.data.amount_paid.split(' ');
        const [coreAmount, coreSymbol] = trace.act.data.core_symbol_amount.split(' ');

        await db.update('neftydrops_claims', {
          amount_spent: preventInt64Overflow(amountSpent.replace('.', '')),
          spent_symbol: spentSymbol,
          core_amount: preventInt64Overflow(coreAmount.replace('.', '')),
          core_symbol: coreSymbol,
        }, {
          str: 'drops_contract = $1 AND claim_id = $2',
          values: [core.args.neftydrops_account, claimId]
        }, ['drops_contract', 'claim_id']);
      }, NeftyDropsUpdatePriority.ACTION_LOG_CLAIM.valueOf()
  ));

  const registerDropClaim = async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<ClaimDropActionData>): Promise<void> => {
    const drop = await db.query(
        'SELECT listing_price, listing_symbol, settlement_symbol, collection_name FROM neftydrops_drops WHERE drops_contract = $1 AND drop_id = $2',
        [core.args.neftydrops_account, trace.act.data.drop_id]
    );

    if (drop.rowCount === 0) {
      logger.warn('NeftyDrops: Drops was purchased but could not find drop');
      return;
      // throw new Error('NeftyDrops: Drop was purchased but was not found');
    }

    let finalPrice = null;
    const {
      listing_symbol: listingSymbol,
      settlement_symbol: settlementSymbol,
      collection_name: collectionName,
    } = drop.rows[0];

    if (parseInt(trace.act.data.intended_delphi_median, 10) === 0 || settlementSymbol === 'NULL') {
      finalPrice = drop.rows[0].listing_price;
    } else {
      const query = await db.query(
          'SELECT pair.invert_delphi_pair, delphi.base_precision, delphi.quote_precision, delphi.median_precision, drop.listing_price ' +
          'FROM neftydrops_symbol_pairs pair, neftydrops_drops drop, delphioracle_pairs delphi ' +
          'WHERE drop.drops_contract = pair.drops_contract AND drop.listing_symbol = pair.listing_symbol AND drop.settlement_symbol = pair.settlement_symbol AND ' +
          'pair.delphi_contract = delphi.contract AND pair.delphi_pair_name = delphi.delphi_pair_name AND ' +
          'drop.drops_contract = $1 AND drop.drop_id = $2',
          [core.args.neftydrops_account, trace.act.data.drop_id]
      );

      if (query.rowCount === 0) {
        throw new Error('NeftyDrops: Drops was purchased but could not find delphi pair');
      }

      const row = query.rows[0];

      if (row.invert_delphi_pair) {
        finalPrice = Math.floor(parseInt(row.listing_price, 10) * parseInt(trace.act.data.intended_delphi_median, 10) *
            Math.pow(10, row.quote_precision - row.base_precision - row.median_precision));
      } else {
        finalPrice = Math.floor((parseInt(row.listing_price, 10) / parseInt(trace.act.data.intended_delphi_median, 10)) *
            Math.pow(10, row.median_precision + row.base_precision - row.quote_precision));
      }
    }

    const amount = parseInt(trace.act.data.amount, 10);
    const totalPrice = (finalPrice * amount).toString();

    await db.insert('neftydrops_claims', {
          claim_id: trace.global_sequence,
          drops_contract: core.args.neftydrops_account,
          assets_contract: core.args.atomicassets_account,
          claimer: trace.act.data.claimer,
          drop_id: trace.act.data.drop_id,
          collection_name: collectionName,
          amount,
          final_price: preventInt64Overflow(finalPrice),
          total_price: preventInt64Overflow(totalPrice),
          listing_symbol: listingSymbol,
          settlement_symbol: settlementSymbol,
          referrer: trace.act.data.referrer,
          country: trace.act.data.country,
          txid: Buffer.from(tx.id, 'hex'),
          created_at_block: block.block_num,
          created_at_time: eosioTimestampToDate(block.timestamp).getTime()
        },
        ['drops_contract', 'claim_id']
    );

    const query = 'UPDATE neftydrops_drops SET current_claimed = current_claimed + $1 WHERE drops_contract = $2 AND drop_id = $3';
    await db.query(query, [amount, core.args.neftydrops_account, trace.act.data.drop_id]);
  };

  destructors.push(processor.onActionTrace(
      contract, 'claimdrop',
      async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<ClaimDropActionData>): Promise<void> => {
        return registerDropClaim(db, block, tx, trace);
      }, NeftyDropsUpdatePriority.ACTION_CLAIM_DROP.valueOf()
  ));

  destructors.push(processor.onActionTrace(
      contract, 'claimdropkey',
      async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<ClaimDropActionData>): Promise<void> => {
        return registerDropClaim(db, block, tx, trace);
      }, NeftyDropsUpdatePriority.ACTION_CLAIM_DROP.valueOf()
  ));

  destructors.push(processor.onActionTrace(
      contract, 'claimdropwl',
      async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<ClaimDropActionData>): Promise<void> => {
        return registerDropClaim(db, block, tx, trace);
      }, NeftyDropsUpdatePriority.ACTION_CLAIM_DROP.valueOf()
  ));

  destructors.push(processor.onActionTrace(
      contract, 'claimwproof',
      async (db: ContractDBTransaction, block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<ClaimDropActionData>): Promise<void> => {
        return registerDropClaim(db, block, tx, trace);
      }, NeftyDropsUpdatePriority.ACTION_CLAIM_DROP.valueOf()
  ));

  return (): any => destructors.map(fn => fn());
}
