import ConnectionManager from '../../connections/manager';
import { INamespaceConfig } from '../../types/config';
import { ApiNamespace } from './interfaces';

import { namespaces } from './loader';

export function getNamespaces(
    configs: INamespaceConfig[], connection: ConnectionManager
): ApiNamespace[] {
    const configHandlers = [];

    for (const config of configs) {
        let namespaceFound = false;

        for (const handler of namespaces) {
            if (config.name !== handler.namespaceName) {
                continue;
            }

            // @ts-ignore
            configHandlers.push(new handler(config.path, connection, config.args));
            namespaceFound = true;

            break;
        }

        if (!namespaceFound) {
            throw new Error('Could not find api namespace "' + config.name + '"');
        }
    }

    return configHandlers;
}
