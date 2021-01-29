import * as express from 'express';

import ConnectionManager from '../../connections/manager';
import { HTTPServer } from '../server';

export abstract class ApiNamespace {
    static namespaceName = '';

    protected constructor(
        readonly path: string,
        readonly connection: ConnectionManager,
        readonly args: {[key: string]: any}
    ) { }

    abstract init(): Promise<void>;
    abstract router(server: HTTPServer): Promise<express.Router>;
    abstract socket(server: HTTPServer): Promise<void>;
}
