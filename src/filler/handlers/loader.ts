import { ContractHandler } from './interfaces';

import AtomicAssetsHandler from './atomicassets';
import AtomicMarketHandler from './atomicmarket';
import AtomicHubHandler from './atomichub';
import DelphiOracleHandler from './delphioracle';

export const handlers: (typeof ContractHandler)[] = [
    AtomicAssetsHandler,
    AtomicMarketHandler,
    AtomicHubHandler,
    DelphiOracleHandler
];
