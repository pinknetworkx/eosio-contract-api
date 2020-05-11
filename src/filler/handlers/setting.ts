import { ContractHandler } from './interfaces';

import AtomicAssetsHandler from './atomicassets';
import AtomicMarketHandler from './atomicmarket';

export const handlers: (typeof ContractHandler)[] = [
    AtomicAssetsHandler,
    AtomicMarketHandler
];
