import * as express from 'express';

import { ApiNamespace } from '../interfaces';
import { HTTPServer } from '../../server';
import { filtersEndpoints } from './routes/filters';
import { neftyMarketComponents } from './openapi';
import {ActionHandlerContext} from '../../actionhandler';
import {ILimits} from '../../../types/config';

export type NeftyMarketNamespaceArgs = {
    atomicassets_account: string,
    connected_reader: string;
    neftymarket_account: string;
    limits?: ILimits;
};

export enum AuctionApiState {
    WAITING = 0, // Auction created but assets were not transferred yet
    LISTED = 1, // Auction pending and open to bids
    CANCELED = 2, // Auction was canceled
    SOLD = 3, // Auction has been sold
    INVALID = 4 // Auction ended but no bid was made
}

export type NeftyMarketContext = ActionHandlerContext<NeftyMarketNamespaceArgs>;

export class NeftyMarketNamespace extends ApiNamespace {
    static namespaceName = 'neftymarket';

    declare args: NeftyMarketNamespaceArgs;

    async init(): Promise<void> {
        if (typeof this.args.atomicassets_account !== 'string') {
            throw new Error('Argument missing in neftymarket api namespace: atomicassets_account');
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
