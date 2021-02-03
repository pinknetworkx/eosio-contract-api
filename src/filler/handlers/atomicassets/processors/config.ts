import AtomicAssetsHandler, { AtomicAssetsUpdatePriority } from '../index';
import DataProcessor from '../../../processor';
import { ContractDBTransaction } from '../../../database';
import { EosioTableRow } from '../../../../types/eosio';
import { ShipBlock } from '../../../../types/ship';
import { ConfigTableRow, TokenConfigsTableRow } from '../types/tables';

export function configProcessor(core: AtomicAssetsHandler, processor: DataProcessor): () => any {
    const destructors: Array<() => any> = [];
    const contract = core.args.atomicassets_account;

    destructors.push(processor.onTableUpdate(
        contract, 'config',
        async (db: ContractDBTransaction, block: ShipBlock, delta: EosioTableRow<ConfigTableRow>): Promise<void> => {
            if (!delta.present) {
                throw new Error('AtomicAssets: config row was deleted. Should not be possible by contract');
            }

            if (core.config.supported_tokens.length !== delta.value.supported_tokens.length) {
                const tokens = core.config.supported_tokens.map((row: {sym: string, contract: string}) => row.sym);

                for (const token of delta.value.supported_tokens) {
                    const index = tokens.indexOf(token.sym);

                    if (index === -1) {
                        await db.insert('atomicassets_tokens', {
                            contract: contract,
                            token_symbol: token.sym.split(',')[1],
                            token_contract: token.contract,
                            token_precision: token.sym.split(',')[0]
                        }, ['contract', 'token_symbol']);
                    }
                }
            }

            if (core.config.collection_format.length !== delta.value.collection_format.length) {
                await db.update('atomicassets_config', {
                    collection_format: delta.value.collection_format.map((element: any) => JSON.stringify(element))
                }, {
                    str: 'contract = $1',
                    values: [contract]
                }, ['contract']);
            }

            core.config = delta.value;
        }, AtomicAssetsUpdatePriority.TABLE_CONFIG.valueOf()
    ));

    destructors.push(processor.onTableUpdate(
        contract, 'tokenconfigs',
        async (db: ContractDBTransaction, block: ShipBlock, delta: EosioTableRow<TokenConfigsTableRow>): Promise<void> => {
            if (!delta.present) {
                throw new Error('AtomicAssets: tokenconfigs row was deleted. Should not be possible by contract');
            }

            if (core.tokenconfigs.version !== delta.value.version) {
                await db.update('atomicassets_config', {
                    version: delta.value.version
                }, {
                    str: 'contract = $1',
                    values: [contract]
                }, ['contract']);
            }

            core.tokenconfigs = delta.value;
        }, AtomicAssetsUpdatePriority.TABLE_CONFIG.valueOf()
    ));

    return (): any => destructors.map(fn => fn());
}
