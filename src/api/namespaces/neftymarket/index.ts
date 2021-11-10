import * as express from 'express';

import { ApiNamespace } from '../interfaces';
import { HTTPServer } from '../../server';
import { filtersEndpoints } from './routes/filters';
import { neftyMarketComponents } from './openapi';

export type NeftyMarketNamespaceArgs = {
    neftymarket_name: string,
    atomicassets_account: string,
    atomicmarket_account: string,
};

export enum NeftyMarketApiState {
    CREATED = 0,
    ACTIVE = 1,
    SOLD_OUT = 2,
    ENDED = 3,
}

export class NeftyMarketNamespace extends ApiNamespace {
    static namespaceName = 'neftymarket';

    declare args: NeftyMarketNamespaceArgs;

    async init(): Promise<void> {
        if (typeof this.args.neftymarket_name !== 'string') {
            throw new Error('Argument missing in neftydrops api namespace: neftymarket_name');
        }

        const market_query = await this.connection.database.query(
            'SELECT * FROM atomicmarket_marketplaces WHERE marketplace_name = $1',
            [this.args.neftymarket_name]
        );

        if (market_query.rowCount === 0) {
            throw new Error(`NeftyMarket not found: ${this.args.neftymarket_name}`);
        } else {
            this.args.atomicmarket_account = market_query.rows[0].market_contract;
        }
    }

    async router(server: HTTPServer): Promise<express.Router> {

        const router = express.Router();

        server.docs.addSchemas(neftyMarketComponents);

        if (server.web.limiter) {
            server.web.express.use(this.path + '/v1', server.web.limiter);
        }

        const endpointsDocs = [];
        endpointsDocs.push(filtersEndpoints(this, server, router));

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
