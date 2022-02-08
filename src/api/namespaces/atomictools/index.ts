import * as express from 'express';

import { ApiNamespace } from '../interfaces';
import { HTTPServer } from '../../server';
import { atomictoolsComponents } from './openapi';
import { configEndpoints } from './routes/config';
import { linksEndpoints } from './routes/links';
import { ActionHandlerContext } from '../../actionhandler';
import { ILimits } from "../../../types/config";

export type AtomicToolsNamespaceArgs = {
    atomictools_account: string,
    atomicassets_account: string,
    limits?: ILimits
};

export type AtomicToolsContext = ActionHandlerContext<AtomicToolsNamespaceArgs>;

export class AtomicToolsNamespace extends ApiNamespace {
    static namespaceName = 'atomictools';

    declare args: AtomicToolsNamespaceArgs;

    async init(): Promise<void> {
        if (typeof this.args.atomictools_account !== 'string') {
            throw new Error('Argument missing in atomictools api namespace: atomictools_account');
        }

        const query = await this.connection.database.query(
            'SELECT * FROM atomictools_config WHERE tools_contract = $1',
            [this.args.atomictools_account]
        );

        if (query.rowCount === 0) {
            if (typeof this.args.atomicassets_account !== 'string') {
                throw new Error('AtomicTools API is not initialized yet (reader not running)');
            }
        } else {
            this.args.atomicassets_account = query.rows[0].assets_contract;
        }
    }

    async router(server: HTTPServer): Promise<express.Router> {
        const router = express.Router();

        server.docs.addSchemas(atomictoolsComponents);

        if (server.web.limiter) {
            server.web.express.use(this.path + '/v1', server.web.limiter);
        }

        const endpointsDocs = [];

        endpointsDocs.push(linksEndpoints(this, server, router));
        endpointsDocs.push(configEndpoints(this, server, router));

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
