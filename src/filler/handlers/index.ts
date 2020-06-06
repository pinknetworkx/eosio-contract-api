import ConnectionManager from '../../connections/manager';
import { IContractConfig } from '../../types/config';
import { PromiseEventHandler } from '../../utils/event';
import { ContractHandler } from './interfaces';

import { handlers } from './loader';

export function getHandlers(
    configs: IContractConfig[], connection: ConnectionManager, events: PromiseEventHandler
): ContractHandler[] {
    const configHandlers = [];

    for (const config of configs) {
        let handlerFound = false;

        for (const handler of handlers) {
            if (config.handler !== handler.handlerName) {
                continue;
            }

            if (config.start_on) {
                // @ts-ignore
                configHandlers.push(new handler(connection, events, config.args, config.start_on));
            } else {
                // @ts-ignore
                configHandlers.push(new handler(connection, events, config.args));
            }

            handlerFound = true;

            break;
        }

        if (!handlerFound) {
            throw new Error('reader handler "' + config.handler + '" not found');
        }
    }

    return configHandlers;
}
