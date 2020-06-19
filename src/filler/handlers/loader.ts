import { ContractHandler } from './interfaces';

import AtomicAssetsHandler from './atomicassets';
import AtomicMarketHandler from './atomicmarket';
import AtomicHubHandler from './atomichub';
import AtomicToolsHandler from './atomictools';
import DelphiOracleHandler from './delphioracle';
import EosioTokenHandler from './eosio.token';
import ResourcesHandler from './eosio.resources';
import WaxHandler from './eosio.wax';

export const handlers: (typeof ContractHandler)[] = [
    AtomicAssetsHandler,
    AtomicMarketHandler,
    AtomicHubHandler,
    AtomicToolsHandler,
    DelphiOracleHandler,
    EosioTokenHandler,
    ResourcesHandler,
    WaxHandler
];
