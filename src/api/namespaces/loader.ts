import { ApiNamespace } from './interfaces';
import { AtomicAssetsNamespace } from './atomicassets';
import { AtomicMarketNamespace } from './atomicmarket';
import { AuthenticationNamespace } from './authentication';
import { AtomicHubNamespace } from './atomichub';
import { AtomicToolsNamespace } from './atomictools';

export const namespaces: (typeof ApiNamespace)[] = [
    AtomicAssetsNamespace,
    AtomicMarketNamespace,
    AtomicHubNamespace,
    AtomicToolsNamespace,
    AuthenticationNamespace
];
