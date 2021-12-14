import * as express from 'express';

import { ApiNamespace } from '../interfaces';
import { HTTPServer } from '../../server';
import { collectionsEndpoints } from './routes/collections';
import { neftyMarketComponents } from './openapi';
import {ActionHandlerContext} from '../../actionhandler';

export type HelpersNamespaceArgs = {
    atomicassets_account: string,
};

export type NeftyMarketContext = ActionHandlerContext<HelpersNamespaceArgs>;

export class HelpersNamespace extends ApiNamespace {
    static namespaceName = 'helpers';

    declare args: HelpersNamespaceArgs;

    async init(): Promise<void> {
        if (typeof this.args.atomicassets_account !== 'string') {
            throw new Error('Argument missing in helpers api namespace: atomicassets_account');
        }
    }

    async router(server: HTTPServer): Promise<express.Router> {

        const router = express.Router();

        server.docs.addSchemas(neftyMarketComponents);

        if (server.web.limiter) {
            server.web.express.use(this.path + '/v1', server.web.limiter);
        }

        const endpointsDocs = [];
        endpointsDocs.push(collectionsEndpoints(this, server, router));

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
