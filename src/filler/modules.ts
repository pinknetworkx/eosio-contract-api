import {join} from 'path';
import { EosioActionTrace, EosioTransaction } from '../types/eosio';
import { ShipBlock } from '../types/ship';
import logger from '../utils/winston';

export interface IModule {
    traceFilter?: (block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<any>) => boolean
}

export class ModuleLoader {
    private readonly modules: Array<IModule>

    constructor(readonly names: string[]) {
        this.modules = [];

        for (const name of names) {
            logger.info('Loading module ' + name);

            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const _module = require(join(__dirname, '../../modules/enabled/', name + '.js'));

            this.modules.push(_module);
        }
    }

    checkTrace(block: ShipBlock, tx: EosioTransaction, trace: EosioActionTrace<any>): boolean {
        for (const mod of this.modules) {
            if (mod.traceFilter && !mod.traceFilter(block, tx, trace)) {
                return false;
            }
        }

        return true;
    }
}
