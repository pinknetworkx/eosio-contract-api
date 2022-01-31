import { DB } from './server';
import { RequestValues } from './namespaces/utils';
import { IServerConfig } from "../types/config";

export interface ActionHandlerContext<T> {
    pathParams: RequestValues,
    db: DB,
    coreArgs: T
}

export type ActionHandler = (params: RequestValues, ctx: ActionHandlerContext<any>) => Promise<any>;
