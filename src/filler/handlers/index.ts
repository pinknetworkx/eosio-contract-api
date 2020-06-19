import { IContractConfig } from '../../types/config';
import { ContractHandler } from './interfaces';

import { handlers } from './loader';
import StateReceiver from '../receiver';

export function getHandlers(reader: StateReceiver, configs: IContractConfig[]): ContractHandler[] {
    const configHandlers = [];

    for (const config of configs) {
        let handlerFound = false;

        for (const handler of handlers) {
            if (config.handler !== handler.handlerName) {
                continue;
            }

            if (config.start_on) {
                // @ts-ignore
                configHandlers.push(new handler(reader, config.args, config.start_on));
            } else {
                // @ts-ignore
                configHandlers.push(new handler(reader, config.args));
            }

            handlerFound = true;

            break;
        }

        if (!handlerFound) {
            throw new Error('Reader handler "' + config.handler + '" not found');
        }
    }

    return configHandlers;
}
