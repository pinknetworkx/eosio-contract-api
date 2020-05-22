import * as express from 'express';
import * as swagger from 'swagger-ui-express';

import { ApiNamespace } from '../interfaces';
import { HTTPServer } from '../../server';
import { assetsEndpoints } from './routes/assets';
import { collectionsEndpoints } from './routes/collections';
import { configEndpoints } from './routes/config';
import { offersEndpoints } from './routes/offers';
import { schemasEndpoints } from './routes/schemas';
import { templatesEndpoints } from './routes/templates';
import { transfersEndpoints } from './routes/transfers';
import logger from '../../../utils/winston';
import { definitions } from './swagger';

export type AtomicAssetsNamespaceArgs = {
    contract: string
};

export class AtomicAssetsNamespace extends ApiNamespace {
    static namespaceName = 'atomicassets';

    args: AtomicAssetsNamespaceArgs;

    async init(): Promise<void> {

    }

    async router(server: HTTPServer): Promise<express.Router> {
        const router = express.Router();

        const documentation: any = {
            swagger: '2.0',
            info: {
                description: 'API for AtomicAssets NFT standard',
                version: '1.0.0',
                title: 'AtomicAssets',
                contact: ['business@pink.gg']
            },
            host: server.config.server_name,
            basePath: this.path,
            schemes: ['https', 'http'],
            tags: [],
            paths: {},
            definitions: definitions
        };

        const endpointsDocs: any[] = [];

        endpointsDocs.push(assetsEndpoints(this, server, router));
        endpointsDocs.push(collectionsEndpoints(this, server, router));
        endpointsDocs.push(configEndpoints(this, server, router));
        endpointsDocs.push(offersEndpoints(this, server, router));
        endpointsDocs.push(schemasEndpoints(this, server, router));
        endpointsDocs.push(templatesEndpoints(this, server, router));
        endpointsDocs.push(transfersEndpoints(this, server, router));

        for (const doc of endpointsDocs) {
            if (doc.tag) {
                documentation.tags.push(doc.tag);
            }

            Object.assign(documentation.paths, doc.paths);
            Object.assign(documentation.definitions, doc.definitions);
        }

        logger.debug(JSON.stringify(documentation));

        server.web.express.use(this.path + '/docs', swagger.serve, swagger.setup(documentation, {
            customCss: '.topbar { display: none; }'
        }));

        return router;
    }

    async socket(server: HTTPServer): Promise<void> {

    }
}
