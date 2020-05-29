import * as express from 'express';

import { AuthenticationNamespace } from './index';
import { HTTPServer } from '../../server';

export function authenticationEndpoints(core: AuthenticationNamespace, server: HTTPServer, router: express.Router): any {
    router.get('/v1/token', (async (_, res) => {

    }));

    router.post('/v1/token', (async (_, res) => {

    }));

    router.delete('/v1/token', (async (_, res) => {

    }));

    return {
        tag: {
            name: 'authentication',
            description: 'Authentication'
        },
        paths: { },
        definitions: {}
    };
}
