import * as express from 'express';
import * as swagger from 'swagger-ui-express';
import * as path from 'path';

import { ApiNamespace } from '../interfaces';
import { HTTPServer } from '../../server';
import { assetsEndpoints, assetsSockets } from './routes/assets';
import { collectionsEndpoints } from './routes/collections';
import { configEndpoints } from './routes/config';
import { offersEndpoints, offersSockets } from './routes/offers';
import { schemasEndpoints } from './routes/schemas';
import { templatesEndpoints } from './routes/templates';
import { transfersEndpoints, transfersSockets } from './routes/transfers';
import logger from '../../../utils/winston';
import { definitions } from './swagger';

export type AtomicAssetsNamespaceArgs = {
    atomicassets_account: string,
    socket_api_prefix: string
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
                description: this.buildDescription(server),
                version: '1.0.0',
                title: 'AtomicAssets API',
                externalDocs: {
                    description: 'NPM Module',
                    url: 'https://www.npmjs.com/package/atomicassets'
                }
            },
            host: server.config.server_name,
            basePath: this.path,
            schemes: ['https', 'http'],
            consumes: ['application/json'],
            produces: ['application/json'],
            tags: [],
            paths: {},
            definitions: definitions
        };

        server.web.express.use(this.path + '/v1', server.web.limiter);

        const endpointsDocs: any[] = [];

        endpointsDocs.push(assetsEndpoints(this, server, router));
        endpointsDocs.push(collectionsEndpoints(this, server, router));
        endpointsDocs.push(schemasEndpoints(this, server, router));
        endpointsDocs.push(templatesEndpoints(this, server, router));

        endpointsDocs.push(offersEndpoints(this, server, router));
        endpointsDocs.push(transfersEndpoints(this, server, router));
        endpointsDocs.push(configEndpoints(this, server, router));

        for (const doc of endpointsDocs) {
            if (doc.tag) {
                documentation.tags.push(doc.tag);
            }

            Object.assign(documentation.paths, doc.paths);
            Object.assign(documentation.definitions, doc.definitions);
        }

        logger.debug('swagger docs', documentation);

        server.web.express.use(this.path + '/docs', express.static(path.resolve(__dirname, '../../../../docs/atomicassets')));

        server.web.express.use(this.path + '/docs/swagger', swagger.serve, swagger.setup(documentation, {
            customCss: '.topbar { display: none; }',
            customCssUrl: 'https://cdn.jsdelivr.net/npm/swagger-ui-themes@3.0.0/themes/3.x/theme-flattop.min.css'
        }));

        return router;
    }

    async socket(server: HTTPServer): Promise<void> {
        assetsSockets(this, server);
        transfersSockets(this, server);
        offersSockets(this, server);
    }

    private buildDescription(server: HTTPServer): string {
        return '### EOSIO Contract API\n' +
            '*Made with ♥️ by [pink.network](https://pink.network/)*\n' +
            '#### Current Chain: ' + server.connections.chain.name + '\n' +
            `#### Provided by: [${server.config.provider_name}](${server.config.provider_url})`;
    }
}
