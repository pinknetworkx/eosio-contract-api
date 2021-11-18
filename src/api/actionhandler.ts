import { DB } from './server';
import { RequestParams } from './namespaces/utils';

export interface ActionHandlerOptions<T> {
    db: DB,
    core: T,
}

export type ActionHandler = (params: RequestParams, options: ActionHandlerOptions<any>) => Promise<any>;
