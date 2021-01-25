import { ApiNamespace } from './interfaces';
import { AtomicAssetsNamespace } from './atomicassets';
import { AtomicMarketNamespace } from './atomicmarket';
import { AuthenticationNamespace } from './authentication';
import { AtomicToolsNamespace } from './atomictools';

export const namespaces: (typeof ApiNamespace)[] = [
    AtomicAssetsNamespace,
    AtomicMarketNamespace,
    AtomicToolsNamespace,
    AuthenticationNamespace
];
