import { ContractHandler } from './interfaces';

import AtomicAssetsHandler from './atomicassets';
import AtomicMarketHandler from './atomicmarket';
import AtomicToolsHandler from './atomictools';
import DelphiOracleHandler from './delphioracle';

export const handlers: (typeof ContractHandler)[] = [
    AtomicAssetsHandler,
    AtomicMarketHandler,
    AtomicToolsHandler,
    DelphiOracleHandler
];
