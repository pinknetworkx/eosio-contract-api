import * as express from 'express';

import { ApiNamespace } from '../interfaces';
import { HTTPServer } from '../../server';
import { questsEndpoints } from './routes/quests';
import { neftyQuestComponents } from './openapi';
import { ActionHandlerContext } from '../../actionhandler';
import { configEndpoints } from './routes/config';

export type NeftyQuestNamespaceArgs = {
    neftyquest_account: string,
};

export type NeftyQuestContext = ActionHandlerContext<NeftyQuestNamespaceArgs>;

export class NeftyQuestNamespace extends ApiNamespace {
    static namespaceName = 'neftyquest';

    declare args: NeftyQuestNamespaceArgs;

    async init(): Promise<void> {
        if (typeof this.args.neftyquest_account !== 'string') {
            throw new Error('Argument missing in neftyquest api namespace: neftyquest_account');
        }
    }

    async router(server: HTTPServer): Promise<express.Router> {

        const router = express.Router();

        server.docs.addSchemas(neftyQuestComponents);

        if (server.web.limiter) {
            server.web.express.use(this.path + '/v1', server.web.limiter);
        }

        const endpointsDocs = [];
        endpointsDocs.push(configEndpoints(this, server, router));
        endpointsDocs.push(questsEndpoints(this, server, router));

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
