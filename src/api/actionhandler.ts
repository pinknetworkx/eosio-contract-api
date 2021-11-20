import { DB } from './server';
import { RequestValues } from './namespaces/utils';

export interface ActionHandlerContext<T> {
    pathParams: RequestValues,
    db: DB,
    core: T,
}

export type ActionHandler = (params: RequestValues, ctx: ActionHandlerContext<any>) => Promise<any>;
