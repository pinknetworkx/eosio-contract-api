import ConnectionManager from '../../connections/manager';
import { IContractConfig } from '../../types/config';
import { PromiseEventHandler } from '../../utils/event';
import { ContractHandler } from './interfaces';

import { handlers } from './setting';

export function getHandlers(
    configs: IContractConfig[], connection: ConnectionManager, events: PromiseEventHandler
): ContractHandler[] {
    const configHandlers = [];

    for (const config of configs) {
        for (const handler of handlers) {
            if (config.handler !== handler.handlerName) {
                continue;
            }

            // @ts-ignore
            configHandlers.push(new handler(connection, events, config.args));
        }
    }

    return configHandlers;
}
