import { IContractConfig } from '../../types/config';
import { ContractHandler } from './interfaces';

import { handlers } from './loader';

export function getHandlers(configs: IContractConfig[]): ContractHandler[] {
    const configHandlers = [];

    for (const config of configs) {
        let handlerFound = false;

        for (const handler of handlers) {
            if (config.handler !== handler.handlerName) {
                continue;
            }

            // @ts-ignore
            configHandlers.push(new handler(reader, config.args));

            handlerFound = true;

            break;
        }

        if (!handlerFound) {
            throw new Error('Reader handler "' + config.handler + '" not found');
        }
    }

    return configHandlers;
}
