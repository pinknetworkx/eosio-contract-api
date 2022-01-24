import * as express from 'express';

import { ApiNamespace } from '../interfaces';
import { HTTPServer } from '../../server';
import { blendDetailsEndpoints, filtersEndpoints } from './routes/blends';
import { neftyBlendsComponents } from './openapi';
import { ActionHandlerContext } from '../../actionhandler';

export type NeftyBlendsNamespaceArgs = {
    atomicassets_account: string,
};

export type NeftyBlendsContext = ActionHandlerContext<NeftyBlendsNamespaceArgs>

export enum NeftyBlendsApiState {
    CREATED = 0,
    ACTIVE = 1,
    SOLD_OUT = 2,
    ENDED = 3,
}

export class NeftyBlendsNamespace extends ApiNamespace {
    static namespaceName = 'neftyblends';

    declare args: NeftyBlendsNamespaceArgs;

    async init(): Promise<void> {  }

    async router(server: HTTPServer): Promise<express.Router> {

        const router = express.Router();

        server.docs.addSchemas(neftyBlendsComponents);

        if (server.web.limiter) {
            server.web.express.use(this.path + '/v1', server.web.limiter);
        }

        const endpointsDocs = [];
        endpointsDocs.push(filtersEndpoints(this, server, router));
        endpointsDocs.push(blendDetailsEndpoints(this, server, router));

        for (const doc of endpointsDocs) {
            if (doc.tag) {
                server.docs.addTags([doc.tag]);
            }

            if (doc.paths) {
                const paths: any = {};

                for (const path of Object.keys(doc.paths)) {
                    paths[this.path + path] = doc.paths[path];
                }

                server.docs.addPaths(paths);
            }
        }

        router.all(['/docs', '/docs/swagger'], (req, res) => res.redirect('/docs'));
        return router;
    }

    async socket(): Promise<void> { }
}