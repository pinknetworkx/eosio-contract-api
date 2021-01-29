import { IContractConfig } from '../../types/config';
import { ContractHandler } from './interfaces';

import { handlers } from './loader';
import Filler from '../filler';

export function getHandlers(configs: IContractConfig[], filler: Filler): ContractHandler[] {
    const configHandlers = [];

    for (const config of configs) {
        let handlerFound = false;

        for (const handler of handlers) {
            if (config.handler !== handler.handlerName) {
                continue;
            }

            // @ts-ignore
            configHandlers.push(new handler(filler, config.args));

            handlerFound = true;

            break;
        }

        if (!handlerFound) {
            throw new Error('Reader handler "' + config.handler + '" not found');
        }
    }

    return configHandlers;
}
