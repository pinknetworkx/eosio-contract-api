import DataProcessor from '../../../processor';
import { ContractDBTransaction } from '../../../database';
import { EosioContractRow } from '../../../../types/eosio';
import { ShipBlock } from '../../../../types/ship';
import { ConfigTableRow } from '../types/tables';
import NeftyMarketHandler, { NeftyMarketUpdatePriority } from '../index';

export function configProcessor(core: NeftyMarketHandler, processor: DataProcessor): () => any {
    const destructors: Array<() => any> = [];
    const contract = core.args.neftymarket_account;

    destructors.push(processor.onContractRow(
        contract, 'config',
        async (db: ContractDBTransaction, block: ShipBlock, delta: EosioContractRow<ConfigTableRow>): Promise<void> => {
            if (!delta.present) {
                throw Error('NeftyMarket: Config should not be deleted');
            }

            if (
                core.config.market_fee !== delta.value.market_fee ||
                core.config.fee_recipient !== delta.value.fee_recipient ||
                core.config.last_bid_threshold !== delta.value.last_bid_threshold ||
                core.config.min_bid_increase !== delta.value.min_bid_increase
            ) {
                await db.update('neftymarket_config', {
                    market_fee: delta.value.market_fee,
                    fee_recipient: delta.value.fee_recipient,
                    last_bid_threshold: delta.value.last_bid_threshold,
                    min_bid_increase: delta.value.min_bid_increase,
                }, {
                    str: 'market_contract = $1',
                    values: [core.args.neftymarket_account]
                }, ['market_contract']);
            }

            if (core.config.supported_tokens.length !== delta.value.supported_tokens.length) {
                const tokens = core.config.supported_tokens.map(row => row.sym.split(',')[1]);

                for (const token of delta.value.supported_tokens) {
                    const index = tokens.indexOf(token.sym.split(',')[1]);

                    if (index === -1) {
                        await db.insert('neftymarket_tokens', {
                            market_contract: core.args.neftymarket_account,
                            token_contract: token.contract,
                            token_symbol: token.sym.split(',')[1],
                            token_precision: token.sym.split(',')[0]
                        }, ['market_contract', 'token_symbol']);
                    } else {
                        tokens.splice(index, 1);
                    }
                }

                if (tokens.length > 0) {
                    throw new Error('NeftyMarket: Supported token removed. Should not be possible');
                }
            }
            core.config = delta.value;
        }, NeftyMarketUpdatePriority.TABLE_CONFIG.valueOf()
    ));

    return (): any => destructors.map(fn => fn());
}
