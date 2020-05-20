import { ApiNamespace } from './interfaces';
import { AtomicAssetsNamespace } from './atomicassets';
import { AtomicMarketNamespace } from './atomicmarket';

export const namespaces: (typeof ApiNamespace)[] = [
    AtomicAssetsNamespace,
    AtomicMarketNamespace
];
