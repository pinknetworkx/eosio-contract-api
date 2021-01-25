import { ApiNamespace } from './interfaces';
import { AtomicAssetsNamespace } from './atomicassets';
import { AtomicMarketNamespace } from './atomicmarket';
import { AtomicToolsNamespace } from './atomictools';

export const namespaces: (typeof ApiNamespace)[] = [
    AtomicAssetsNamespace,
    AtomicMarketNamespace,
    AtomicToolsNamespace
];
