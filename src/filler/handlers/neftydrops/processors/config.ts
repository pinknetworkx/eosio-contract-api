import DataProcessor from '../../../processor';
import { ContractDBTransaction } from '../../../database';
import { EosioContractRow } from '../../../../types/eosio';
import { ShipBlock } from '../../../../types/ship';
import { ConfigTableRow } from '../types/tables';
import NeftyDropsHandler, {NeftyDropsUpdatePriority} from '../index';

export function configProcessor(core: NeftyDropsHandler, processor: DataProcessor): () => any {
    const destructors: Array<() => any> = [];
    const contract = core.args.neftydrops_account;

    destructors.push(processor.onContractRow(
        contract, 'config',
        async (db: ContractDBTransaction, block: ShipBlock, delta: EosioContractRow<ConfigTableRow>): Promise<void> => {
            if (!delta.present) {
                return;
                // throw Error('NeftyDrops: Config should not be deleted');
            }

            if (
                core.config.version !== delta.value.version ||
                core.config.drop_fee !== delta.value.drop_fee ||
                core.config.drop_fee_recipient !== delta.value.drop_fee_recipient
            ) {
                await db.update('neftydrops_config', {
                    version: delta.value.version,
                    drop_fee: delta.value.drop_fee,
                    drop_fee_recipient: delta.value.drop_fee_recipient || 'neftyblocksx',
                }, {
                    str: 'drops_contract = $1',
                    values: [core.args.neftydrops_account]
                }, ['drops_contract']);
            }

            if (core.config.supported_tokens.length !== delta.value.supported_tokens.length) {
                const tokens = core.config.supported_tokens.map(row => row.token_symbol.split(',')[1]);

                for (const token of delta.value.supported_tokens) {
                    const index = tokens.indexOf(token.token_symbol.split(',')[1]);

                    if (index === -1) {
                        await db.insert('neftydrops_tokens', {
                            drops_contract: core.args.neftydrops_account,
                            token_contract: token.token_contract,
                            token_symbol: token.token_symbol.split(',')[1],
                            token_precision: token.token_symbol.split(',')[0]
                        }, ['drops_contract', 'token_symbol']);
                    } else {
                        tokens.splice(index, 1);
                    }
                }

                if (tokens.length > 0) {
                    throw new Error('NeftyDrops: Supported token removed. Should not be possible');
                }
            }

            if (core.config.supported_symbol_pairs.length !== delta.value.supported_symbol_pairs.length) {
                const pairs = core.config.supported_symbol_pairs.map(
                    row => row.listing_symbol.split(',')[1] + ':' + row.settlement_symbol.split(',')[1]
                );

                for (const pair of delta.value.supported_symbol_pairs) {
                    const index = pairs.indexOf(pair.listing_symbol.split(',')[1] + ':' + pair.settlement_symbol.split(',')[1]);

                    if (index === -1) {
                        await db.insert('neftydrops_symbol_pairs', {
                            drops_contract: core.args.neftydrops_account,
                            listing_symbol: pair.listing_symbol.split(',')[1],
                            settlement_symbol: pair.settlement_symbol.split(',')[1],
                            delphi_contract: delta.value.delphioracle_account,
                            delphi_pair_name: pair.delphi_pair_name,
                            invert_delphi_pair: pair.invert_delphi_pair
                        }, ['drops_contract', 'listing_symbol', 'settlement_symbol']);
                    } else {
                        pairs.splice(index, 1);
                    }
                }

                if (pairs.length > 0) {
                    throw new Error('NeftyDrops: Symbol pair removed. Should not be possible');
                }
            }

            core.config = delta.value;
        }, NeftyDropsUpdatePriority.TABLE_CONFIG.valueOf()
    ));

    return (): any => destructors.map(fn => fn());
}
