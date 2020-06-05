import ConnectionManager from '../../connections/manager';
import { IContractConfig } from '../../types/config';
import { PromiseEventHandler } from '../../utils/event';
import { ContractHandler } from './interfaces';

import { handlers } from './settings';

export function getHandlers(
    configs: IContractConfig[], connection: ConnectionManager, events: PromiseEventHandler
): ContractHandler[] {
    const configHandlers = [];

    for (const config of configs) {
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

        }
    }

    return configHandlers;
}
