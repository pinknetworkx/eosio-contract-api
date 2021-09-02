import * as express from 'express';

import { ApiNamespace } from '../interfaces';
import { HTTPServer } from '../../server';
import { neftyDropsComponents} from './openapi';
import { configEndpoints } from './routes/config';
import {statsEndpoints} from './routes/stats';
import {dropsEndpoints} from './routes/drops';

export type NeftyDropsNamespaceArgs = {
    neftydrops_account: string,
    atomicassets_account: string,
};

export enum DropApiState {
    CREATED = 0,
    ACTIVE = 1,
    SOLD_OUT = 2,
    ENDED = 3,
}

export class NeftyDropsNamespace extends ApiNamespace {
    static namespaceName = 'neftydrops';

    declare args: NeftyDropsNamespaceArgs;

    async init(): Promise<void> {
        if (typeof this.args.neftydrops_account !== 'string') {
            throw new Error('Argument missing in neftydrops api namespace: neftydrops_account');
        }

        const query = await this.connection.database.query(
            'SELECT * FROM neftydrops_config WHERE drops_contract = $1',
            [this.args.neftydrops_account]
        );

        if (query.rowCount === 0) {
            if (typeof this.args.neftydrops_account !== 'string') {
                throw new Error('NeftyDrops API is not initialized yet (reader not running)');
            }
        } else {
            this.args.neftydrops_account = query.rows[0].drops_contract;
        }
    }

    async router(server: HTTPServer): Promise<express.Router> {

        const router = express.Router();

        server.docs.addSchemas(neftyDropsComponents);

        if (server.web.limiter) {
            server.web.express.use(this.path + '/v1', server.web.limiter);
        }

        const endpointsDocs = [];
        endpointsDocs.push(configEndpoints(this, server, router));
        endpointsDocs.push(dropsEndpoints(this, server, router));
        endpointsDocs.push(statsEndpoints(this, server, router));

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
