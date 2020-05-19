import { ApiNamespace } from './interfaces';
import { AtomicAssetsNamespace } from './atomicassets';

export const namespaces: (typeof ApiNamespace)[] = [
    AtomicAssetsNamespace
];
