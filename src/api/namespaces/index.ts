import ConnectionManager from '../../connections/manager';
import { INamespaceConfig } from '../../types/config';
import { ApiNamespace } from './interfaces';

import { namespaces } from './settings';

export function getNamespaces(
    configs: INamespaceConfig[], connection: ConnectionManager
): ApiNamespace[] {
    const configHandlers = [];

    for (const config of configs) {
        for (const handler of namespaces) {
            if (config.name !== handler.namespaceName) {
                continue;
            }

            // @ts-ignore
            configHandlers.push(new handler(config.path, connection, config.args));
        }
    }

    return configHandlers;
}
